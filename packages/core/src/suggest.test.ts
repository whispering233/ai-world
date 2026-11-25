import { describe, expect, it } from 'vitest'
import { createFauxLlm } from './llm.ts'
import { createStubSuggester, createSuggester, HINT_MAX_CHARS, parseHints, type SuggestInput } from './suggest.ts'

const INPUT: SuggestInput = {
  sceneText: '雨夜的酒馆，灯快没了。',
  place: '酒馆',
  here: ['安'],
  holds: [{ name: '银元', count: 2 }],
  knows: ['安说过账本锁在柜台下面。'],
  playerClaim: '我把银元放在柜台上。',
  observation: '安把杯子收走了。',
}

describe('parseHints：模型文本 → 3 条短句', () => {
  it('合法 JSON 原样取出', () => {
    expect(parseHints('{"hints":["问安账本的事","把杯子推回柜台","看一眼地窖门"]}')).toEqual([
      '问安账本的事',
      '把杯子推回柜台',
      '看一眼地窖门',
    ])
  })

  it('围栏与前后说明文字都能剥掉', () => {
    const text = '好的，这是结果：\n```json\n{"hints":["问安账本的事","把杯子推回柜台"]}\n```\n需要更多可以说。'
    expect(parseHints(text)).toEqual(['问安账本的事', '把杯子推回柜台'])
  })

  it('去空、去重、最多 3 条', () => {
    const text = JSON.stringify({ hints: ['  问安账本的事  ', '', '问安账本的事', '把杯子推回柜台', '看一眼地窖门', '第四条'] })
    expect(parseHints(text)).toEqual(['问安账本的事', '把杯子推回柜台', '看一眼地窖门'])
  })

  it('每条按码点裁到 40 字', () => {
    const long = '问'.repeat(60)
    const [hint] = parseHints(JSON.stringify({ hints: [long] }))
    expect(Array.from(hint ?? '')).toHaveLength(HINT_MAX_CHARS)
  })

  it('非字符串项丢掉，不当成一条', () => {
    expect(parseHints(JSON.stringify({ hints: [1, '问安账本的事', null, { text: '把杯子推回柜台' }] }))).toEqual([
      '问安账本的事',
    ])
  })

  it('坏 JSON 与空输出都返回空数组，不抛到一拍上', () => {
    expect(parseHints('没有 JSON')).toEqual([])
    expect(parseHints('{"hints":[')).toEqual([])
    expect(parseHints('')).toEqual([])
  })

  it('hints 不是数组时返回空数组', () => {
    expect(parseHints('{"hints":"问安账本的事"}')).toEqual([])
  })
})

describe('createSuggester：prompt 只含玩家可见的东西', () => {
  it('system 固定、prompt 带地点/在场/持有/已知/本拍原话与感知', async () => {
    const prompts: { system?: string; content: string }[] = []
    const llm = {
      async chat(req: { system?: string; messages: { content: string }[] }) {
        prompts.push({ ...(req.system === undefined ? {} : { system: req.system }), content: req.messages[0]?.content ?? '' })
        return { text: '{"hints":["问安账本的事"]}', toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'faux/suggest' }
      },
    }
    const res = await createSuggester(llm).suggest(INPUT)

    expect(res.hints).toEqual(['问安账本的事'])
    const sent = prompts[0]
    expect(sent?.system).toContain('"hints"')
    expect(sent?.content).toContain('酒馆')
    expect(sent?.content).toContain('安')
    expect(sent?.content).toContain('银元×2')
    expect(sent?.content).toContain('安说过账本锁在柜台下面。')
    expect(sent?.content).toContain('我把银元放在柜台上。')
    expect(sent?.content).toContain('安把杯子收走了。')
  })

  it('桩脚本走同一条解析路径', async () => {
    const res = await createStubSuggester(['{"hints":["看一眼地窖门","问安账本的事"]}']).suggest(INPUT)
    expect(res.hints).toEqual(['看一眼地窖门', '问安账本的事'])
  })

  it('模型胡说时给空数组并留下降级原因', async () => {
    const res = await createSuggester(createFauxLlm(['我觉得你应该做点什么。'])).suggest(INPUT)
    expect(res.hints).toEqual([])
    expect(res.notes?.[0]).toContain('动作提示未产出')
  })
})