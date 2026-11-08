import type { Engine, EngineErrorCode } from '@suhaengcut/engine'

export type EngineFn = keyof Engine

export type InitMessage = {
  type: 'init'
  relayBaseUrl: string | null // null이면 데모 모드
  deviceId: string
  /** 개발용: OpenAlex를 중계 없이 직접 호출 */
  openAlexDirect: boolean
}

export type CallMessage = { type: 'call'; id: number; fn: EngineFn; arg: unknown }

export type ErrorPayload = { code: EngineErrorCode | 'UNKNOWN'; message: string }

export type ReplyMessage = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: ErrorPayload }
