import { describe, expect, it } from 'vitest'
import type { ChatRequest, Llm } from './llm.ts'
import { createNarrator, createStubNarrator, fallbackPassage, type NarrationInput } from './narrate.ts'

/** 记下发出去的 system 与 user：要检查的是提示词本身，不是模型输出。 */
function capture(): { narrator: ReturnType<typeof createNarrator>; seen: ChatRequest[] } {
  const seen: ChatRequest[] = []
  const llm: Llm = {
    async chat(req) {
      seen.push(req)
      return { text: '雨还没停。', toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'test' }
    },
  }
  return { narrator: createNarrator(llm), seen }
}

function input(): NarrationInput {
  return {
    clockBefore: 1000,
    clockAfter: 1005,
    sceneText: '雨夜的酒馆，灯快没了。',
    events: [
      { actor: 'ann', text: '我一脚踹开铁门', outcome: '门被踹开了' },
      { actor: 'bob', text: '我抓住那把枪', outcome: '被拒绝了：枪压在对方身下' },
    ],
  }
}

describe('渲染：只出文本，不写回', () => {
  it('旁白失败 fallback 只列已结算结果，不新增事实', () => {
    const text = fallbackPassage(input().events)
    expect(text).toContain('叙述没有生成')
    expect(text).toContain('ann：我一脚踹开铁门 → 门被踹开了')
    expect(text).toContain('bob：我抓住那把枪 → 被拒绝了：枪压在对方身下')
    // 不写绝对时间，也不写额外的世界变化
    expect(text).not.toContain('第 ')
  })

  it('fallback 优先用显示名', () => {
    const text = fallbackPassage([{ actor: 'ann', name: '安', text: '我把杯子推过去', outcome: '杯子到了柜台边' }])
    expect(text).toContain('安：我把杯子推过去')
    expect(text).not.toContain('ann：')
  })
  it('正常文本原样返回，absoluteTime 为空', async () => {
    const prose = '雨还没停。\n门上留下一个新鲜的脚印。'
    const out = await createStubNarrator([prose]).narrate(input())
    expect(out.text).toBe(prose)
    expect(out.absoluteTime).toEqual([])
  })

  it('三种绝对时间形态各自命中，顺序与出现顺序一致', async () => {
    const prose = '第3天清晨你醒在镇上，上午10点才出门，14:30 到了车站，14：31 车开走了。'
    const out = await createStubNarrator([prose]).narrate(input())
    expect(out.absoluteTime).toEqual(['第3天', '上午10点', '14:30', '14：31'])
    // 只报告，不删改：原文一字未动
    expect(out.text).toBe(prose)
  })

  it('相对说法不误判，也不误伤“过了三天”', async () => {
    const prose = '过了一会儿，天已经黑了。过了三天，他才想起那扇门。'
    const out = await createStubNarrator([prose]).narrate(input())
    expect(out.absoluteTime).toEqual([])
    expect(out.text).toBe(prose)
  })

  it('中文数字与日期形态也能盖住', async () => {
    const prose = '第三天一早，三月五日那天的事又被提起。'
    const out = await createStubNarrator([prose]).narrate(input())
    expect(out.absoluteTime).toEqual(['第三天', '三月五日'])
  })
})

describe('渲染提示词：已落账 / 未成立', () => {
  it('每个事件都标出是否已落账', async () => {
    const { narrator, seen } = capture()
    await narrator.narrate({
      ...input(),
      events: [
        { actor: 'ann', name: '安', text: '我一脚踹开铁门', outcome: '门被踹开了', committed: true },
        { actor: 'bob', name: '鲍勃', text: '我抓住那把枪', outcome: '被拒绝了：枪压在对方身下', committed: false },
      ],
    })
    const user = seen[0]?.messages[0]?.content ?? ''
    expect(user).toContain('[已落账] 安：我一脚踹开铁门')
    expect(user).toContain('[未成立] 鲍勃：我抓住那把枪')
  })

  it('system 含三条编排规则', async () => {
    const { narrator, seen } = capture()
    await narrator.narrate(input())
    const system = seen[0]?.system ?? ''
    expect(system).toContain('独立人物段落最多两段')
    expect(system).toContain('至少出现一次')
    expect(system).toContain('不要一个动作一段')
  })
})
