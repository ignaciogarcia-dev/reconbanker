import { http, HttpResponse } from 'msw'

export const accountHandlers = [
  http.get('http://localhost:3000/accounts', () =>
    HttpResponse.json([
      { id: 'a-1', bank: 'mi-dinero', name: 'Cuenta 1', status: 'active' },
    ])
  ),
  http.get('http://localhost:3000/banks', () =>
    HttpResponse.json([
      { id: 'b-1', code: 'mi-dinero', name: 'Mi Dinero', loginUrl: null, status: 'ready' },
    ])
  ),
  http.post('http://localhost:3000/accounts', () =>
    HttpResponse.json({ id: 'a-2' }, { status: 201 })
  ),
]
