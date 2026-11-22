/**
 * 探针：填肉。骨架 + 前因 + 现场 → 1 到 2 句正文。
 *
 * 只回答：模型会不会在填肉时自造前因（上一轮裁判正是这么干的）、写绝对时间、泄漏实体 id。
 * 不测：抽卡命中率、多拍连贯、成本摊到 20 拍。
 *
 * 用法：node --experimental-strip-types scripts/probe-storylet-fill.ts
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from '@ai-world/core'
import { createLlm } from '@ai-world/core'
import { readonlyPiCredentials } from '@ai-world/core'
import { fillEvent, SKELETONS } from './storylet-pool.ts'
import type { Fact } from '@ai-world/core'

const SCENE = '酒馆里：你、安、道森、科迪、格蕾妮。灯还亮着。外面的雨没停。'

function cause(text: string, at = 0): Fact {
  return { id: `f${at}`, text, at }
}

const CASES = [
  { id: 'lamp-dies', causes: [cause('安把灶膛里的火压小了，说店里不许见明火。')] },
  { id: 'door-blown', causes: [cause('有人推门进来，门闩没有插到底。', 3)] },
  { id: 'cellar-lifts', causes: [cause('格蕾妮说地窖下面这几天一直在渗水。', 5)] },
]

async function main(): Promise<void> {
  const piDefault = readPiDefaultModel(join(homedir(), '.pi', 'agent')) ?? FALLBACK_MODEL
  const cfg = loadModelConfig(process.env.AI_WORLD_CONFIG ?? 'config/models.json', piDefault)
  const usage = { input: 0, output: 0, ms: 0, calls: 0 }
  const llm = createLlm({
    models: cfg.models,
    credentials: readonlyPiCredentials(),
    sessionId: `storylet-fill-${randomUUID()}`,
    ...(cfg.retry ? { retry: cfg.retry } : {}),
    onUsage: (s) => {
      usage.input += s.input
      usage.output += s.output
      usage.ms += s.ms
      usage.calls += 1
    },
  })
  process.stdout.write(`填肉探针：${CASES.length} 条骨架\n模型 narration=${cfg.models.narration}\n\n`)

  let failures = 0
  for (const c of CASES) {
    const skeleton = SKELETONS.find((s) => s.id === c.id)
    if (!skeleton) {
      process.stdout.write(`${c.id}：骨架不存在（脚本 bug）\n`)
      continue
    }
    const started = performance.now()
    try {
      const filled = await fillEvent(llm, SCENE, c.causes, skeleton)
      const ms = Math.round(performance.now() - started)
      process.stdout.write(`[${c.id}] ${ms}ms  ${filled.chars} 字\n`)
      process.stdout.write(`  前因：${c.causes.map((f) => f.text).join(' / ')}\n`)
      process.stdout.write(`  骨架：${skeleton.template}\n`)
      process.stdout.write(`  成文：${filled.text}\n`)
      process.stdout.write(`  检查：绝对时间 ${filled.absoluteTime.length === 0 ? '无' : filled.absoluteTime.join(',')} · id 泄漏 ${filled.idLeaks.length === 0 ? '无' : filled.idLeaks.join(',')}\n\n`)
      failures = 0
    } catch (error) {
      failures += 1
      process.stdout.write(`[${c.id}] 调用失败：${(error as Error).message}\n`)
      if (failures >= 2) {
        process.stdout.write('连续两次失败，探针中止。\n')
        break
      }
    }
  }
  process.stdout.write(`耗时 ${usage.ms}ms / 调用 ${usage.calls} 次 / tokens ${usage.input} / ${usage.output}\n`)
}

void main()
