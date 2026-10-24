import { test, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

test('una consulta colgada a version.json no bloquea las siguientes', async () => {
  vi.useFakeTimers()
  const dispatchEvent = vi.fn()
  vi.stubGlobal('window', { sessionStorage: null, location: { reload: vi.fn() }, dispatchEvent })
  vi.stubGlobal('process', { ...process, env: { ...process.env, NEXT_PUBLIC_APP_VERSION: 'v1' } })
  // La primera respuesta nunca llega (servidor reiniciando); solo termina si la abortan.
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('abortado')))
  }))
  vi.stubGlobal('fetch', fetchMock)
  const { verificarVersion } = await import('@/utils/versionCheck')

  const primera = verificarVersion('foco')
  await vi.advanceTimersByTimeAsync(10_000)
  await expect(primera).resolves.toBe('nada')

  fetchMock.mockImplementation(async () => new Response('{"version":"v2"}', { status: 200 }))
  await expect(verificarVersion('foco')).resolves.toBe('avisar')
  expect(dispatchEvent).toHaveBeenCalled()
})
