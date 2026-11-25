#!/usr/bin/env bash
set -euo pipefail

PROJECT=orchllc
ZONE=us-central1-c
REGION=us-central1
VM=orchserver
BUCKET=gs://orchllc-artifacts
SYNC_ENV=false
[[ "${1:-}" == "--env" ]] && SYNC_ENV=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLOUD="$ROOT/services/cloud"
INFRA="$ROOT/infra/cloud"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/src"
tar --exclude=target --exclude=.git --exclude=.env.yaml -C "$ROOT" -cf - \
  Cargo.toml Cargo.lock .cargo crates/harness services/cloud | tar -xf - -C "$WORK/src"

# Strip the desktop workspace member from the staged workspace Cargo.toml cleanly.
grep -v '"apps/desktop/src-tauri"' "$WORK/src/Cargo.toml" > "$WORK/src/Cargo.toml.tmp"
mv "$WORK/src/Cargo.toml.tmp" "$WORK/src/Cargo.toml"
cp "$INFRA/.gcloudignore" "$WORK/src/.gcloudignore"

echo "==> Building on Cloud Build"
BUILD_ID="$(gcloud builds submit "$WORK/src" \
  --project "$PROJECT" --region "$REGION" \
  --config "$INFRA/cloudbuild.yaml" \
  --gcs-source-staging-dir "$BUCKET/source" \
  --format='value(id)')"
echo "build: $BUILD_ID"

FILES=()

if $SYNC_ENV; then
  echo "==> Converting .env.yaml"
  [ -f "$CLOUD/.env.yaml" ] || { echo "missing $CLOUD/.env.yaml"; exit 1; }
  umask 077
  ruby -ryaml -rjson -e '
    env = YAML.load_file(ARGV[1])
    env["PORT"] = "8080"
    lines = env.map do |key, value|
      text = value.is_a?(String) ? value.strip : value.to_json
      text = JSON.generate(JSON.parse(text)) if text.start_with?("[", "{")
      abort "newline in #{key}" if text.include?("\n")
      %(#{key}="#{text.gsub(/[\\"]/) { |c| "\\" + c }}")
    end
    File.write(ARGV[0], lines.join("\n") + "\n")
  ' "$WORK/orch.env" "$CLOUD/.env.yaml"
  FILES+=("$WORK/orch.env")
fi

if [ ${#FILES[@]} -gt 0 ]; then
  echo "==> Uploading env to $VM"
  gcloud compute scp "${FILES[@]}" "$VM:/tmp/" --zone "$ZONE" --project "$PROJECT"
fi

echo "==> Downloading binary on the VM, installing and verifying /healthz"
OBJECT="orch-cloud-harness%2F${BUILD_ID}%2Forch-cloud-harness"
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" --command "
set -euo pipefail
TOKEN=\$(curl -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token | sed -n 's/.*\"access_token\":\"\\([^\"]*\\)\".*/\\1/p')
[ -n \"\$TOKEN\" ] || { echo 'no metadata token'; exit 1; }
curl -fsS --retry 5 --retry-delay 3 -H \"Authorization: Bearer \$TOKEN\" -o /tmp/orch-cloud-harness 'https://storage.googleapis.com/storage/v1/b/${BUCKET#gs://}/o/${OBJECT}?alt=media'
[ -s /tmp/orch-cloud-harness ]
if [ -f /opt/orch/orch-cloud-harness ]; then sudo cp -p /opt/orch/orch-cloud-harness /opt/orch/orch-cloud-harness.prev; fi
sudo install -o root -g root -m 755 /tmp/orch-cloud-harness /opt/orch/orch-cloud-harness.new
sudo mv /opt/orch/orch-cloud-harness.new /opt/orch/orch-cloud-harness
if [ -f /tmp/orch.env ]; then sudo install -o root -g orch -m 640 /tmp/orch.env /etc/orch.env; fi
rm -f /tmp/orch-cloud-harness /tmp/orch.env
sudo systemctl restart orch

HEALTHY=false
for i in \$(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8080/healthz > /dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 1
done

if [ \"\$HEALTHY\" != \"true\" ]; then
  sudo journalctl -u orch -n 40 --no-pager
  if [ -f /opt/orch/orch-cloud-harness.prev ]; then
    echo 'health check failed; rolling back to previous binary'
    sudo cp -p /opt/orch/orch-cloud-harness.prev /opt/orch/orch-cloud-harness
    sudo systemctl restart orch
  fi
  exit 1
fi
echo 'orch is active and healthy'
"
