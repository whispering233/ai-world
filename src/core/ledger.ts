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

function applyOne(w: World, op: Op): OpResult {
  switch (op.op) {
    case 'move': {
      if (!exists(w, op.who)) return fail(`不存在的实体：${op.who}`)
      w.ledger.at[op.who] = op.to
      return OK
    }

    case 'give': {
      if (!exists(w, op.from) || !exists(w, op.to)) return fail('持有者或接收者不存在')
      if (!Number.isInteger(op.n) || op.n <= 0) return fail('数量必须是正整数')
      if (held(w, op.from, op.item) < op.n) return fail(`${op.from} 身上没有这么多 ${op.item}`)
      takeItems(w, op.from, op.item, op.n)
      addItems(w, op.to, op.item, op.n)
      return OK
    }

    case 'take': {
      if (!exists(w, op.from)) return fail(`不存在的实体：${op.from}`)
      if (!Number.isInteger(op.n) || op.n <= 0) return fail('数量必须是正整数')
      if (held(w, op.from, op.item) < op.n) return fail(`${op.from} 身上没有这么多 ${op.item}`)
      takeItems(w, op.from, op.item, op.n)
      return OK
    }

    case 'phys': {
      if (!exists(w, op.who)) return fail(`不存在的实体：${op.who}`)
      if (op.key === '') return fail('phys 的键不能为空')
      if (isBadNumber(op.value)) return fail('phys 的值不能是 NaN/Infinity')
      physOf(w, op.who)[op.key] = op.value
      return OK
    }

    case 'rel': {
      if (!exists(w, op.from) || !exists(w, op.to)) return fail('关系的一方不存在')
      if (!Number.isFinite(op.delta)) return fail('关系增量必须是有限数')
      const row = relOf(w, op.from)
      row[op.to] = clampRel((row[op.to] ?? 0) + op.delta)
      return OK
    }

    case 'learn': {
      const text = op.text.trim()
      if (text === '') return fail('事实文本不能为空')
      const missing = op.who.filter((id) => !exists(w, id))
      if (missing.length > 0) return fail(`不存在的实体：${missing.join(', ')}`)
      const fact = addFact(w, text)
      for (const id of op.who) {
        const list = knowsOf(w, id)
        if (!list.includes(fact.id)) list.push(fact.id)
      }
      return OK
    }

    default: {
      const unknown: never = op
      return fail(`未知操作：${JSON.stringify(unknown)}`)
    }
  }
}

/** JSON 边界可能带进 NaN/Infinity，只能在这里判（类型系统管不到）。 */
function isBadNumber(value: number | boolean): boolean {
  return typeof value === 'number' && !Number.isFinite(value)
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
