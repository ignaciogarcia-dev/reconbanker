import { http, HttpResponse } from 'msw'

export const userHandlers = [
  http.get('http://localhost:3000/me', () =>
    HttpResponse.json({
      id: 'u-1',
      email: 'test@x',
      name: 'T',
      operation_mode: 'passthrough',
    })
  ),
]
