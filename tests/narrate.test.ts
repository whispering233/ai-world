import { describe, expect, it } from 'vitest'
import { createStubNarrator, fallbackPassage, type NarrationInput } from '../src/core/narrate.ts'

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
