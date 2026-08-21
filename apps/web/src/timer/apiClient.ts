export type GetToken = () => Promise<string | null>

/** Error carrying the API's message so the UI can show something useful. */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Authenticated JSON fetch. Throws ApiError with the server's message. */
export async function request<T>(
  path: string,
  getToken: GetToken,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken()

  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      body !== null && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${response.status})`

    throw new ApiError(message, response.status)
  }

  return body as T
}
