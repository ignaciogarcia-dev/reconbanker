import { http, HttpResponse } from 'msw'

export const userHandlers = [
  http.get('/api/me', () =>
    HttpResponse.json({
      id: 'u-1',
      email: 'test@x',
      name: 'T',
      operation_mode: 'passthrough',
    })
  ),
]
