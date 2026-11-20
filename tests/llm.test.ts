import { describe, expect, it } from 'vitest'
import { createFauxLlm, createLlm, type ChatMessage } from '../src/core/llm.ts'

const ask: ChatMessage[] = [{ role: 'user', content: '你好' }]

describe('createFauxLlm：离线脚本', () => {
  it('按顺序返回脚本文本，超出后复用最后一条', async () => {
    const llm = createFauxLlm(['甲', '乙'])
    const texts: string[] = []
    for (let i = 0; i < 4; i++) texts.push((await llm.chat({ tier: 'fast', messages: ask })).text)
    expect(texts).toEqual(['甲', '乙', '乙', '乙'])
  })

  it('结果是 text / inputTokens / outputTokens / model 四字段', async () => {
    const res = await createFauxLlm(['好的']).chat({ tier: 'strong', messages: ask })
    expect(res).toEqual({ text: '好的', inputTokens: 0, outputTokens: 0, model: 'faux/strong' })
  })
})

describe('createLlm：缺配置在 chat() 时才报错', () => {
  it('未配置档位抛出的错误含 tier 与 model 串', async () => {
    const llm = createLlm({ models: { fast: '', strong: 'deepseek/NOT_A_MODEL', mid: 'openai/gpt-4.1-mini' } })
    await expect(llm.chat({ tier: 'fast', messages: ask })).rejects.toThrow(/tier=fast model=\(空\)/)
    await expect(llm.chat({ tier: 'strong', messages: ask })).rejects.toThrow(
      /tier=strong model=deepseek\/NOT_A_MODEL/,
    )
  })
})
