'use client'
import { useActionState, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { subscribe } from '../app/actions'
import { DEFAULT, EVENTS, fmt, level, num, reads } from '../lib/heat'

export function HeatMap() {
  const [k, setK] = useState(DEFAULT)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const b = box.current
    if (b) b.scrollLeft = b.scrollWidth
  }, [])
  const pick = (e: SyntheticEvent) => {
    const v = (e.target as HTMLElement).dataset.k
    if (v !== undefined) setK(+v)
  }
  const ev = EVENTS[k]
  return (
    <>
      <div
        id="heat"
        ref={box}
        role="group"
        aria-label="Daily reads for the last 52 weeks. Hotter squares are days Orch published."
        onPointerOver={pick}
        onClick={pick}
        onFocus={pick}
      >
        <div>
          {reads.map((r, idx) => {
            const e = EVENTS[idx]
            return (
              <i
                key={idx}
                data-k={idx}
                data-l={level(r)}
                aria-current={idx === k ? 'true' : undefined}
                {...(e ? { tabIndex: 0, role: 'img', 'aria-label': `${fmt(idx)}: ${e[1]}` } : {})}
              />
            )
          })}
        </div>
      </div>
      <output>
        <s data-l={level(reads[k])} />
        <span>
          <b>{fmt(k)}.</b> {ev ? `${ev[0]}: ${ev[1]}.` : 'Nothing published.'} {num(reads[k])} reads that day.
        </span>
      </output>
    </>
  )
}

export function Subscribe() {
  const [msg, action, pending] = useActionState(subscribe, '')
  return (
    <>
      <form action={action}>
        <input type="email" name="email" required placeholder="you@orch.live" aria-label="Email address" />
        <button disabled={pending}>Subscribe</button>
      </form>
      <output>{msg}</output>
    </>
  )
}
