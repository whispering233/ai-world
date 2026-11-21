import { describe, expect, it } from 'vitest'
import { createCognition, createStubCognition, type CognitionInput } from '../src/core/cognition.ts'
import type { ChatRequest } from '../src/core/llm.ts'
import type { Character } from '../src/core/character.ts'

function input(over: Partial<CognitionInput> = {}): CognitionInput {
  const character: Character = {
    id: 'ann',
    core: '作者写的 200 字',
    voice: '短句，少形容词',
    drives: [{ id: 'd1', text: '不想再欠人情', heat: 0.9 }],
    beliefs: { bob: '他撒过谎' },
    experience: [],
    busyUntil: 0,
  }
  return { character, sceneText: '他把杯子推过来。', canon: ['屋里只有一盏灯'], now: 100, ...over }
}

describe('createCognition：显示名', () => {
  it('beliefs 的键用显示名，不泄漏 id', async () => {
    const seen: ChatRequest[] = []
    const llm = {
      async chat(req: ChatRequest) {
        seen.push(req)
        return { text: JSON.stringify({ inner: '', outward: '我看着他。' }), toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'faux/cognition' }
      },
    }
    await createCognition(llm).think(input({ names: { bob: '鲍勃' } }))
    const system = seen[0]?.system ?? ''
    expect(system).toContain('鲍勃：他撒过谎')
    expect(system).not.toContain('bob：')
  })
})

describe('createCognition：crossTalk 第二轮', () => {
  it('prompt 含其他人的公开输出与自己的草稿，不要求他人 inner', async () => {
    const seen: ChatRequest[] = []
    const llm = {
      async chat(req: ChatRequest) {
        seen.push(req)
        return {
          text: JSON.stringify({ inner: '听着', outward: '我改口了' }),
          toolCalls: [],
          inputTokens: 0,
          outputTokens: 0,
          model: 'faux/cognition',
        }
      },
    }
    const req = input({
      crossTalk: {
        self: '我先把杯子推过去',
        others: [{ actor: 'doc', text: '医生抬了下眼' }],
      },
    })
    await createCognition(llm).think(req)
    const prompt = seen[0]?.messages[0]?.content ?? ''
    expect(prompt).toContain('医生抬了下眼')
    expect(prompt).toContain('我先把杯子推过去')
    expect(prompt).toContain('你可以坚持、补充、改口或沉默')
  })
})

describe('createStubCognition：合法 JSON 切分', () => {
  it('inner/outward 各自就位，并写回一条 seen', async () => {
    const script = JSON.stringify({ inner: '忍住没骂', outward: '我不渴。', selfChange: '' })
    const { output, experience } = await createStubCognition([script]).think(input())

    expect(output).toEqual({ inner: '忍住没骂', outward: '我不渴。' })
    expect(output.selfChange).toBeUndefined()
    expect(experience).toEqual([{ t: 100, kind: 'seen', text: '我不渴。', w: 2 }])
  })

  it('selfChange 非空时随 output 交出（写不写 self 由调用方的 canWriteSelf 判）', async () => {
    const script = JSON.stringify({ inner: '', outward: '我走了。', selfChange: '我不再指望他替我说话' })
    const { output, experience } = await createStubCognition([script]).think(input())

    expect(output.selfChange).toBe('我不再指望他替我说话')
    expect(experience).toHaveLength(1)
    expect(experience[0]?.kind).toBe('seen')
  })
})

describe('createStubCognition：切不出来时不丢内容、不抛异常', () => {
  it('非法 JSON 时 inner 空串、outward 为原始整段文本', async () => {
    const raw = '他什么也没说，只是把杯子推回去。'
    const { output } = await createStubCognition([raw]).think(input())

    expect(output).toEqual({ inner: '', outward: raw })
  })

  it('缺 outward 字段时同样回退到原始文本', async () => {
    const raw = '{"inner":"只想了这一句"}'
    const { output } = await createStubCognition([raw]).think(input())

    expect(output.inner).toBe('')
    expect(output.outward).toBe(raw)
  })

  it('空文本也不抛', async () => {
    const { output, experience } = await createStubCognition(['']).think(input())
    expect(output).toEqual({ inner: '', outward: '' })
    expect(experience[0]?.text).toBe('')
  })
})

describe('createStubCognition：超长裁到 120 / 80 字', () => {
  it('outward 120 字、inner 80 字，按码点计', async () => {
    const script = JSON.stringify({ inner: '想'.repeat(100), outward: '说'.repeat(200) })
    const { output, experience } = await createStubCognition([script]).think(input())

    expect(Array.from(output.outward)).toHaveLength(120)
    expect(Array.from(output.inner)).toHaveLength(80)
    expect(experience[0]?.text).toBe(output.outward)
  })

  it('回退路径同样裁到 120 字', async () => {
    const { output } = await createStubCognition(['原'.repeat(150)]).think(input())
    expect(Array.from(output.outward)).toHaveLength(120)
  })
})
