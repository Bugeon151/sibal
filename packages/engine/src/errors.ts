export type EngineErrorCode =
  | 'INVALID_INPUT'
  | 'MODE_FORBIDDEN'
  | 'NO_RESULTS'
  | 'EXPIRED'
  | 'RATE_LIMITED'
  | 'SOURCES_DOWN'
  | 'OFFLINE'

const defaultMessages: Record<EngineErrorCode, string> = {
  INVALID_INPUT: '입력한 내용을 다시 확인해 주세요.',
  MODE_FORBIDDEN: '검색만 모드에서는 쓸 수 없는 기능이에요.',
  NO_RESULTS: '자료를 찾지 못했어요. 키워드를 바꿔 다시 검색해 보세요.',
  EXPIRED: '검색 기록이 만료되었어요. 다시 검색해 주세요.',
  RATE_LIMITED: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  SOURCES_DOWN: '자료 검색이 잠시 안 돼요. 잠시 후 다시 시도해 주세요.',
  OFFLINE: '인터넷 연결을 확인해 주세요. 이전에 검색한 기록은 볼 수 있어요.',
}

export class EngineError extends Error {
  readonly code: EngineErrorCode
  constructor(code: EngineErrorCode, message?: string) {
    super(message ?? defaultMessages[code])
    this.name = 'EngineError'
    this.code = code
  }
}
