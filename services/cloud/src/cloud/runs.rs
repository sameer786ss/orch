use std::collections::VecDeque;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use orchharness::events::ChatEvent;
use tokio::sync::{mpsc, watch};
use tokio_util::sync::CancellationToken;

use crate::shared::config;
use crate::shared::firestore::FirestoreClient;
use crate::shared::sse::KEEP_ALIVE_BLOCK;
use crate::shared::util::now_ms;

struct Inner {
    events: VecDeque<(u64, Arc<str>)>,
    bytes: usize,
    next_id: u64,
    finished: bool,
}

impl Inner {
    fn has_gap(&self, after: u64) -> bool {
        self.events
            .front()
            .is_some_and(|(first, _)| *first > after.saturating_add(1))
    }
}

pub struct LiveRun {
    pub run_id: String,
    pub cancel: CancellationToken,
    inner: Mutex<Inner>,
    notify: watch::Sender<u64>,
}

pub struct Batch {
    pub events: Vec<(u64, Arc<str>)>,
    pub finished: bool,
    pub gap: bool,
}

impl LiveRun {
    pub fn new(run_id: String) -> Arc<Self> {
        let (notify, _) = watch::channel(0u64);
        Arc::new(Self {
            run_id,
            cancel: CancellationToken::new(),
            inner: Mutex::new(Inner {
                events: VecDeque::new(),
                bytes: 0,
                next_id: 1,
                finished: false,
            }),
            notify,
        })
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn push(&self, block: &str) {
        let id = {
            let mut inner = self.lock();
            let id = inner.next_id;
            inner.next_id += 1;
            let body: Vec<&str> = block
                .trim_end_matches('\n')
                .lines()
                .filter(|line| !line.starts_with("id:"))
                .collect();
            let text: Arc<str> = Arc::from(format!("id: {id}\n{}\n\n", body.join("\n")));
            inner.bytes += text.len();
            inner.events.push_back((id, text));
            while inner.bytes > config::MAX_RUN_BUFFER_BYTES && inner.events.len() > 1 {
                if let Some((_, evicted)) = inner.events.pop_front() {
                    inner.bytes = inner.bytes.saturating_sub(evicted.len());
                }
            }
            id
        };
        self.notify.send_replace(id);
    }

    pub fn finish(&self) {
        self.lock().finished = true;
        self.notify.send_modify(|_| {});
    }

    pub fn is_finished(&self) -> bool {
        self.lock().finished
    }

    pub async fn wait_finished(&self) {
        let mut watcher = self.notify.subscribe();
        while !self.is_finished() {
            if watcher.changed().await.is_err() {
                return;
            }
        }
    }

    pub fn read_after(&self, after: u64) -> Batch {
        let inner = self.lock();
        let first = inner.events.front().map(|(id, _)| *id);
        let start = first.map_or(0, |first| {
            usize::try_from(after.saturating_add(1).saturating_sub(first)).unwrap_or(usize::MAX)
        });
        Batch {
            events: inner
                .events
                .range(start.min(inner.events.len())..)
                .cloned()
                .collect(),
            finished: inner.finished,
            gap: inner.has_gap(after),
        }
    }

    pub fn has_gap(&self, after: u64) -> bool {
        self.lock().has_gap(after)
    }

    pub fn subscribe(&self) -> watch::Receiver<u64> {
        self.notify.subscribe()
    }
}

pub fn spawn_subscriber(run: Arc<LiveRun>, after: u64) -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel(config::SUBSCRIBER_CHANNEL_CAPACITY);
    tokio::spawn(async move {
        let mut watcher = run.subscribe();
        let mut last = after;
        let mut ticker = tokio::time::interval(Duration::from_secs(config::KEEPALIVE_SECS));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            let batch = run.read_after(last);
            if batch.gap {
                return;
            }
            let drained = batch.events.is_empty();
            for (id, text) in batch.events {
                if tx.send(text.to_string()).await.is_err() {
                    return;
                }
                last = id;
            }
            if batch.finished && drained {
                return;
            }
            tokio::select! {
                _ = watcher.changed() => {}
                _ = ticker.tick() => {
                    if tx.send(KEEP_ALIVE_BLOCK.to_string()).await.is_err() {
                        return;
                    }
                }
            }
        }
    });
    rx
}

async fn emit_error(tx: &mpsc::Sender<String>, message: &str, code: &str) {
    let _ = tx.send(ChatEvent::error_with_code(message, code).to_sse_block()).await;
}

async fn tail(firestore: &FirestoreClient, session_id: &str, tx: &mpsc::Sender<String>) {
    if tx.send(ChatEvent::Resync.to_sse_block()).await.is_err() {
        return;
    }

    let mut failures = 0u32;
    loop {
        let record = match firestore.get_session(session_id).await {
            Ok(Some(rec)) => {
                failures = 0;
                rec
            }
            Ok(None) => return,
            Err(error) => {
                tracing::warn!(session = session_id, %error, "tail poll failed");
                failures += 1;
                if failures >= config::TAIL_MAX_FAILURES {
                    emit_error(tx, "The run could not be followed.", "tail_failed").await;
                    return;
                }
                tokio::time::sleep(Duration::from_millis(config::TAIL_POLL_MS)).await;
                continue;
            }
        };

        if record.is_running(now_ms()) {
            tokio::time::sleep(Duration::from_millis(config::TAIL_POLL_MS)).await;
            if tx.send(KEEP_ALIVE_BLOCK.to_string()).await.is_err() {
                return;
            }
            continue;
        }

        if record.run_status == "running" {
            emit_error(
                tx,
                "The run was interrupted before it finished.",
                "run_interrupted",
            )
            .await;
        }
        return;
    }
}

pub fn spawn_tail(firestore: FirestoreClient, session_id: String) -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel(config::SUBSCRIBER_CHANNEL_CAPACITY);
    tokio::spawn(async move {
        tail(&firestore, &session_id, &tx).await;
        let _ = tx.send(ChatEvent::Done.to_sse_block()).await;
    });
    rx
}
