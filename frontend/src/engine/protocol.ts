import type { Engine, EngineErrorCode } from '@suhaengcut/engine'

export type EngineFn = keyof Engine

export type InitMessage = {
  type: 'init'
  /** null이면 중계 함수 없음: 해외 논문(OpenAlex)만 직접 검색 */
  relayBaseUrl: string | null
  /** 개발용 데모 모드 (예시 자료) */
  demo: boolean
  deviceId: string
  /** 개발용: OpenAlex를 중계 없이 직접 호출 */
  openAlexDirect: boolean
}

export type CallMessage = { type: 'call'; id: number; fn: EngineFn; arg: unknown }

export type ErrorPayload = { code: EngineErrorCode | 'UNKNOWN'; message: string }

export type ReplyMessage = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: ErrorPayload }
