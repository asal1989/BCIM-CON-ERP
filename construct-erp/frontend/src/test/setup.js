import '@testing-library/jest-dom';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { server } from '../mocks/server';

// Axios needs an absolute URL in Vitest's Node environment so MSW can
// intercept API requests just as the browser would.
process.env.REACT_APP_API_URL = 'http://localhost/api/v1';

// Recharts' responsive containers use this browser API, which jsdom does not
// provide.  A minimal no-op implementation is sufficient for component tests.
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserver;

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
