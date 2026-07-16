import { rest } from 'msw';

const BASE = 'http://localhost/api/v1';

export const handlers = [
  // Auth
  rest.post(`${BASE}/auth/login`, (req, res, ctx) => {
    const { email, password } = req.body;
    if (email === 'admin@test.com' && password === 'Test@1234') {
      return res(ctx.json({
        user: { id: 'user-1', name: 'Test Admin', email, role: 'admin', company_id: 'co-1', company_name: 'Test Co' },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      }));
    }
    return res(ctx.status(401), ctx.json({ error: 'Invalid email or password.' }));
  }),

  rest.post(`${BASE}/auth/logout`, (req, res, ctx) =>
    res(ctx.json({ message: 'Logged out successfully.' }))
  ),

  rest.get(`${BASE}/auth/me`, (req, res, ctx) => {
    const auth = req.headers.get('Authorization') || '';
    if (!auth || auth.includes('bad-token') || auth.includes('invalid-token')) {
      return res(ctx.status(401), ctx.json({ error: 'Invalid token.' }));
    }
    return res(ctx.json({
      id: 'user-1', name: 'Test Admin', email: 'admin@test.com',
      role: 'admin', company_id: 'co-1', company_name: 'Test Co',
    }));
  }),

  rest.post(`${BASE}/auth/refresh`, (req, res, ctx) =>
    res(ctx.json({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' }))
  ),

  // Projects
  rest.get(`${BASE}/projects`, (req, res, ctx) =>
    res(ctx.json({
      data: [
        { id: 'proj-1', name: 'Alpha Tower', status: 'active', type: 'residential', location: 'Mumbai', contract_value: 50000000 },
        { id: 'proj-2', name: 'Beta Mall', status: 'planning', type: 'commercial', location: 'Pune', contract_value: 80000000 },
      ],
      count: 2,
    }))
  ),

  rest.delete(`${BASE}/projects/:id`, (req, res, ctx) =>
    res(ctx.json({ message: 'Project deleted' }))
  ),
];
