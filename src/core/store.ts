/**
 * 存储与回放：journal.jsonl / passage.jsonl 追加写，重放即真相（见 docs/db/schema.md §3 §4）。
 *
 * 不存 state.json 快照：账本由 journal 逐条 commit 得出，两份状态迟早会不一致。
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyDriveHit, remember, type Character, type Experience } from './character.ts'
import { commit, type Claim, type DriveHit, type Observation, type Verdict } from './referee.ts'
import type { EntId, World } from './world.ts'

export interface JournalEntry {
  seq: number
  type: 'beat' | 'scene/fold'
  scene: string
  clock: number
  claims: Claim[]
  order: EntId[]
  verdicts: Verdict[]
  observations: Record<EntId, Observation>
  driveHits: DriveHit[]
  /** 本拍每人新增的记忆条目（不是快照）；旧 journal 没有这个字段 */
  experience?: Record<EntId, Experience[]>
}

export interface PassageEntry {
  seq: number
  clock: number
  text: string
  source: 'narrator' | 'player' | 'npc' | 'fallback'
}

export interface Store {
  appendBeat(entry: Omit<JournalEntry, 'seq'>): JournalEntry
  appendPassage(entry: Omit<PassageEntry, 'seq'>): PassageEntry
  readJournal(): JournalEntry[]
  readPassage(): PassageEntry[]
  close(): void
}

const JOURNAL = 'journal.jsonl'
const PASSAGE = 'passage.jsonl'

export function openStore(dir: string): Store {
  mkdirSync(dir, { recursive: true })
  const journalPath = join(dir, JOURNAL)
  const passagePath = join(dir, PASSAGE)
  let journalSeq = prepare(journalPath)
  let passageSeq = prepare(passagePath)
  let closed = false

  const guard = (): void => {
    if (closed) throw new Error('store 已关闭')
  }

  return {
    appendBeat(entry) {
      guard()
      const rec: JournalEntry = { seq: ++journalSeq, ...entry }
      appendFileSync(journalPath, `${JSON.stringify(rec)}\n`)
      return rec
    },
    appendPassage(entry) {
      guard()
      const rec: PassageEntry = { seq: ++passageSeq, ...entry }
      appendFileSync(passagePath, `${JSON.stringify(rec)}\n`)
      return rec
    },
    readJournal: () => parseLines<JournalEntry>(readText(journalPath)),
    readPassage: () => parseLines<PassageEntry>(readText(passagePath)),
    close() {
      closed = true
    },
  }
}

/** seq 从文件里已有的合法行数推出，因此重开进程后仍连续。 */
function prepare(path: string): number {
  const text = readText(path)
  // 尾部撕裂后直接追加会和半行粘成一条；补一个换行让它独立成行被丢弃
  if (text !== '' && !text.endsWith('\n')) appendFileSync(path, '\n')
  return parseLines<unknown>(text).length
}

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/** 坏行（含尾部撕裂的半行）逐条丢掉：不报错、不修内容、不废整份文件。 */
function parseLines<T>(text: string): T[] {
  const out: T[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      out.push(JSON.parse(line) as T)
    } catch {
      // 半行没法解析，跳过即可
    }
  }
  return out
}

/** 按 seq 升序逐条 commit；顺序由 seq 定，不由入参数组顺序定。 */
export function replay(entries: readonly JournalEntry[], initial: World): World {
  return [...entries]
    .sort((a, b) => a.seq - b.seq)
    .reduce((world, e) => {
      // clock 是账本的一部分，必须随每条记录恢复：否则重放出来的 fact.at 全部停在初始时刻
      const at = { ...world, ledger: { ...world.ledger, clock: e.clock } }
      const out = { order: e.order, verdicts: e.verdicts, observations: e.observations, driveHits: e.driveHits }
      return commit(at, out).world
    }, initial)
}

/**
 * 只用 journal 重建人物记忆与驱动热度。
 *
 * 存的是“本拍新增的条目”，不是快照：重放按 seq 顺序把同一批条目重新 append 一次。
 * 旧 journal 没有 experience 字段，人物就停在初始状态——不崩，也不假装记得。
 */
export function replayCharacters(
  entries: readonly JournalEntry[],
  initial: Map<EntId, Character>,
): Map<EntId, Character> {
  const chars = new Map(initial)
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
    for (const hit of e.driveHits ?? []) {
      const ch = chars.get(hit.ent)
      if (ch) chars.set(hit.ent, applyDriveHit(ch, hit))
    }
    for (const [ent, list] of Object.entries(e.experience ?? {})) {
      const ch = chars.get(ent)
      if (!ch) continue
      chars.set(ent, list.reduce((acc, item) => remember(acc, item), ch))
    }
  }
  return chars
}
