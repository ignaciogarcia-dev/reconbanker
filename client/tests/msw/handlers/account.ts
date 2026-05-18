import { http, HttpResponse } from 'msw'

export const accountHandlers = [
  http.get('/api/accounts', () =>
    HttpResponse.json([
      { id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active' },
    ])
  ),
  http.get('/api/banks', () =>
    HttpResponse.json([
      { id: 'b-1', code: 'mi-dinero', name: 'Mi Dinero', loginUrl: null, status: 'ready' },
    ])
  ),
  http.post('/api/accounts', () =>
    HttpResponse.json({ id: 'a-2' }, { status: 201 })
  ),
]
