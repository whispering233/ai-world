// 复用 pi CLI 自己的凭据文件（~/.pi/agent/auth.json），只读：本程序不改写 pi 的登录状态。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CredentialStore } from '@earendil-works/pi-ai'
import { piAgentDir } from './config.ts'

type RawCredential = { type: 'api_key'; key?: string }

export function piAuthFile(): string {
  return join(piAgentDir(), 'auth.json')
}

export function readonlyPiCredentials(file: string = piAuthFile()): CredentialStore {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, RawCredential>
  return {
    async read(providerId) {
      return raw[providerId]
    },
    async list() {
      return Object.entries(raw).map(([providerId, c]) => ({ providerId, type: c.type }))
    },
    async modify() {
      throw new Error('只读凭据：不修改 pi 的 auth.json')
    },
    async delete() {
      throw new Error('只读凭据：不删除 pi 的 auth.json')
    },
  }
}
