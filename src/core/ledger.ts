import { clampRel, type EntId, type Fact, type FactId, type Op, type OpResult, type World } from './world.ts'

const OK: OpResult = { ok: true }

function fail(why: string): OpResult {
  return { ok: false, why }
}

/**
 * 应用一批操作。纯函数：不改入参，返回新世界与逐条结果。
 *
 * 一条 op 失败不影响其它 op（各自独立提交）；失败的那条不写入任何状态。
 * 这里**没有独立的审核阶段**：校验就是每个 op 自己的前置条件。
 *
 * 这个函数必须是**全函数**：模型送进来的 op 可能缺字段、类型不对、字段是字符串而不是数组。
 * 任何形状错误都返回 ok:false，绝不抛异常——一拍因为一条畸形 op 崩掉，等于世界被一句话杀死。
 */
export function apply(world: World, ops: readonly Op[]): { world: World; results: OpResult[] } {
  const next: World = structuredClone(world)
  const results = ops.map((op) => applyOne(next, op))
  return { world: next, results }
}

function exists(w: World, id: string): boolean {
  return Object.hasOwn(w.ledger.at, id)
}

function held(w: World, id: EntId, item: string): number {
  return w.ledger.holds[id]?.[item] ?? 0
}

function str(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function applyOne(w: World, op: Op): OpResult {
  // SAFETY: Op 只是编译期契约，真实数据来自模型的 JSON，字段可能缺失或类型不对；
  // 下面逐个字段摸清形状，任何不符都返回 ok:false，绝不让异常穿出去。
  const raw = op as unknown as Record<string, unknown>
  switch (raw['op']) {
    case 'move': {
      const who = raw['who']
      const to = raw['to']
      if (!str(who) || !str(to)) return fail('move 需要字符串 who 与 to')
      if (!exists(w, who)) return fail(`不存在的实体：${who}`)
      if (!Object.hasOwn(w.places, to)) return fail(`不存在的地点：${to}（只能去已有地点）`)
      w.ledger.at[who] = to
      return OK
    }

    case 'give': {
      const from = raw['from']
      const to = raw['to']
      const item = raw['item']
      const n = raw['n']
      if (!str(from) || !str(to) || !str(item) || !Number.isInteger(n)) return fail('give 字段不完整')
      if ((n as number) <= 0) return fail('数量必须是正整数')
      if (!exists(w, from) || !exists(w, to)) return fail('持有者或接收者不存在')
      if (held(w, from, item) < (n as number)) return fail(`${from} 身上没有这么多 ${item}`)
      takeItems(w, from, item, n as number)
      addItems(w, to, item, n as number)
      return OK
    }

    case 'take': {
      const from = raw['from']
      const item = raw['item']
      const n = raw['n']
      if (!str(from) || !str(item) || !Number.isInteger(n)) return fail('take 字段不完整')
      if ((n as number) <= 0) return fail('数量必须是正整数')
      if (!exists(w, from)) return fail(`不存在的实体：${from}`)
      if (held(w, from, item) < (n as number)) return fail(`${from} 身上没有这么多 ${item}`)
      takeItems(w, from, item, n as number)
      return OK
    }

    case 'phys': {
      const who = raw['who']
      const key = raw['key']
      const value = raw['value']
      if (!str(who) || !str(key)) return fail('phys 需要字符串 who 与 key')
      if (!exists(w, who)) return fail(`不存在的实体：${who}`)
      if (typeof value !== 'number' && typeof value !== 'boolean') return fail('phys 的值只能是数字或布尔')
      if (typeof value === 'number' && !Number.isFinite(value)) return fail('phys 的值不能是 NaN/Infinity')
      physOf(w, who)[key] = value
      return OK
    }

    case 'rel': {
      const from = raw['from']
      const to = raw['to']
      const delta = raw['delta']
      if (!str(from) || !str(to) || typeof delta !== 'number') return fail('rel 需要 from / to / delta')
      if (!exists(w, from) || !exists(w, to)) return fail('关系的一方不存在')
      if (!Number.isFinite(delta)) return fail('关系增量必须是有限数')
      const row = relOf(w, from)
      row[to] = clampRel((row[to] ?? 0) + delta)
      return OK
    }

    case 'fact': {
      const text = raw['text']
      if (!str(text) || text.trim() === '') return fail('事实文本不能为空')
      addFact(w, text.trim())
      return OK
    }

    case 'know': {
      const ref = raw['fact']
      const who = asIds(raw['who'])
      if (!str(ref) || who === undefined) return fail('know 需要 fact（id 或一句话的事实）与 who')
      const missing = who.filter((id) => !exists(w, id))
      if (missing.length > 0) return fail(`不存在的实体：${missing.join(', ')}`)
      // 裁判看不到 fact id，只会写“告诉他什么事”；以文本形式给就等于新事实。
      // 这不是宽松：事实本来就只能由裁判产生，谁开口、什么内容都是它说了算。
      const known = w.facts[ref] ?? addFact(w, ref.trim())
      if (known.supersededBy !== undefined) return fail(`事实已被推翻：${known.id}`)
      for (const id of who) {
        const list = knowsOf(w, id)
        if (!list.includes(known.id)) list.push(known.id)
      }
      return OK
    }

    default:
      return fail(`未知操作：${JSON.stringify(raw).slice(0, 120)}`)
  }
}

/** 模型常把 who 写成单个字符串；这里两个形状都收，其它形状算非法。 */
function asIds(value: unknown): string[] | undefined {
  if (typeof value === 'string') return value === '' ? undefined : [value]
  if (!Array.isArray(value)) return undefined
  return value.every((v): v is string => typeof v === 'string') ? value : undefined
}

function takeItems(w: World, who: EntId, item: string, n: number): void {
  const bag = holdsOf(w, who)
  const left = (bag[item] ?? 0) - n
  if (left === 0) delete bag[item]
  else bag[item] = left
}

function addItems(w: World, who: EntId, item: string, n: number): void {
  const bag = holdsOf(w, who)
  bag[item] = (bag[item] ?? 0) + n
}

function holdsOf(w: World, who: EntId): Record<string, number> {
  const existing = w.ledger.holds[who]
  if (existing) return existing
  const fresh: Record<string, number> = {}
  w.ledger.holds[who] = fresh
  return fresh
}

function physOf(w: World, who: EntId): Record<string, number | boolean> {
  const existing = w.ledger.phys[who]
  if (existing) return existing
  const fresh: Record<string, number | boolean> = {}
  w.ledger.phys[who] = fresh
  return fresh
}

function relOf(w: World, from: EntId): Record<string, number> {
  const existing = w.ledger.rel[from]
  if (existing) return existing
  const fresh: Record<string, number> = {}
  w.ledger.rel[from] = fresh
  return fresh
}

function knowsOf(w: World, who: EntId): FactId[] {
  const existing = w.ledger.knows[who]
  if (existing) return existing
  const fresh: FactId[] = []
  w.ledger.knows[who] = fresh
  return fresh
}

/** fact id 由「现有事实数」推出，因此回放时必然一致（无随机、无时钟依赖）。 */
function addFact(w: World, text: string): Fact {
  const fact: Fact = { id: `f${Object.keys(w.facts).length}`, text, at: w.ledger.clock }
  w.facts[fact.id] = fact
  return fact
}
