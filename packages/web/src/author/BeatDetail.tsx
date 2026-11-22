import type { AuthorBeatView, OpView, PromptCallView, TelemetryView, WorldView } from '@ai-world/shared'
import { Collapsible } from '../ui/Collapsible.tsx'
import { LedgerView } from './LedgerView.tsx'

export interface BeatDetailProps {
  beat: AuthorBeatView | null
  /** 账本快照来自 `GET /api/author/session`，单拍详情里不重复带 */
  world: WorldView | null
}

/** 本拍详情：claims / verdicts / notes / telemetry，往下是账本原始与 prompt。 */
export function BeatDetail({ beat, world }: BeatDetailProps) {
  if (beat === null) return <p className="text-meta text-ink-soft">点左边的一拍，看它怎么被裁决的。</p>
  const { entry } = beat
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-meta text-ink-soft">claims（{entry.claims.length}）</h3>
        {entry.claims.length === 0 ? (
          <p className="text-meta text-ink-soft">这一拍没有主张。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entry.claims.map((claim) => (
              <li key={claim.id}>
                <p className="text-meta text-ink-soft">
                  {claim.id} · {claim.actor} · {claim.kind}
                </p>
                <p className="text-body">{claim.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-meta text-ink-soft">verdicts（{entry.verdicts.length}）</h3>
        {entry.verdicts.length === 0 ? (
          <p className="text-meta text-ink-soft">这一拍没有裁决。</p>
        ) : (
          entry.verdicts.map((verdict) => (
            <article key={verdict.claimId} className="mb-3 border-l-2 border-rule pl-3">
              <p className="text-meta text-ink-soft">
                {verdict.ok ? 'ok' : 'no'} · {verdict.claimId} · {verdict.actor} · {verdict.duration} 分钟
              </p>
              {verdict.reason !== undefined && <p className="text-body">理由：{verdict.reason}</p>}
              {verdict.deltas.length === 0 ? (
                <p className="text-meta text-ink-soft">没有改动</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {verdict.deltas.map((delta, index) => (
                    <li key={index}>
                      <DeltaLine delta={delta} />
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </section>

      <section>
        <h3 className="mb-2 text-meta text-ink-soft">notes（{beat.notes.length}）</h3>
        {beat.notes.length === 0 ? (
          <p className="text-meta text-ink-soft">没有降级。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-meta">
            {beat.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-meta text-ink-soft">telemetry</h3>
        {entry.telemetry === undefined ? (
          <p className="text-meta text-ink-soft">这一拍没有 telemetry。</p>
        ) : (
          <TelemetryTable telemetry={entry.telemetry} />
        )}
      </section>

      <Collapsible summary="账本原始">
        {world === null ? <p className="text-meta text-ink-soft">还没有读到账本。</p> : <LedgerView world={world} />}
      </Collapsible>

      <Collapsible summary={`prompt（${beat.prompts.length}）`}>
        {beat.prompts.length === 0 ? (
          <p className="text-meta text-ink-soft">超出环形缓冲窗口（最近 3 拍），这一拍的 prompt 已经丢了。</p>
        ) : (
          beat.prompts.map((call, index) => <PromptCall key={index} call={call} />)
        )}
      </Collapsible>
    </div>
  )
}

function DeltaLine({ delta }: { delta: OpView }) {
  return <span className="text-meta text-ink">{JSON.stringify(delta)}</span>
}

function TelemetryTable({ telemetry }: { telemetry: TelemetryView }) {
  return (
    <table className="w-full border-collapse text-left text-meta">
      <thead>
        <tr>
          {['角色', '模型', 'calls', 'cost', 'ms'].map((column) => (
            <th key={column} scope="col" className="border-b border-rule py-1 pr-3 font-normal text-ink-soft">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(Object.keys(telemetry.models) as (keyof TelemetryView['models'])[]).map((role) => {
          const usage = telemetry.usage[role]
          return (
            <tr key={role}>
              <td className="border-b border-rule py-1 pr-3">{role}</td>
              <td className="border-b border-rule py-1 pr-3">{telemetry.models[role]}</td>
              <td className="border-b border-rule py-1 pr-3">{usage.calls}</td>
              <td className="border-b border-rule py-1 pr-3">{usage.cost.toFixed(4)}</td>
              <td className="border-b border-rule py-1 pr-3">{usage.ms}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function PromptCall({ call }: { call: PromptCallView }) {
  return (
    <article className="mb-4 border-t border-rule pt-2">
      <p className="text-meta text-ink-soft">
        {call.role} · {call.ms}ms · retries {call.retries}
      </p>
      {call.system !== undefined && (
        <>
          <h4 className="mt-2 text-meta text-ink-soft">system</h4>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-meta">{call.system}</pre>
        </>
      )}
      <h4 className="mt-2 text-meta text-ink-soft">messages</h4>
      {call.messages.map((message, index) => (
        <pre key={index} className="overflow-x-auto whitespace-pre-wrap break-all text-meta">
          {message.role}: {message.content}
        </pre>
      ))}
      <h4 className="mt-2 text-meta text-ink-soft">text</h4>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-meta text-ink">{call.text}</pre>
    </article>
  )
}
