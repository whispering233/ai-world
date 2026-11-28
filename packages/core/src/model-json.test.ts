import { describe, expect, it } from 'vitest'
import { parseModelJson, tryParseModelJson } from './model-json.ts'

describe('parseModelJson：真模型的实际输出形态', () => {
  it('纯 JSON', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('带 markdown 围栏', () => {
    const text = '```json\n{"inner":"想","outward":"说"}\n```'
    expect(parseModelJson(text)).toEqual({ inner: '想', outward: '说' })
  })

  it('前后带说明文字', () => {
    const text = '好的，这是结果：\n{"a":{"b":2}}\n希望有帮助。'
    expect(parseModelJson(text)).toEqual({ a: { b: 2 } })
  })

  it('字符串里含括号与转义引号时不会截错', () => {
    const text = '{"say":"他说 \\"别\\" 然后 {笑了}"}'
    expect(parseModelJson(text)).toEqual({ say: '他说 "别" 然后 {笑了}' })
  })

  it('截断的输出由 repair 补全', () => {
    expect(parseModelJson('说明\n{"a":1,"b":')).toMatchObject({ a: 1 })
  })

  it('完全没有对象时抛出（由调用方回退）', () => {
    expect(() => parseModelJson('什么都没有')).toThrow()
  })
})

describe('tryParseModelJson：降级留在调用点', () => {
  it('能解析时与 parseModelJson 同结果', () => {
    expect(tryParseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('解析不出来时返回 undefined，不抛', () => {
    expect(tryParseModelJson('什么都没有')).toBeUndefined()
    expect(tryParseModelJson('')).toBeUndefined()
  })

  it('数组不是对象：同样返回 undefined', () => {
    expect(tryParseModelJson('[1,2]')).toBeUndefined()
  })
})
