import useAuthStore from '../store/authStore';

// Reset store between tests
const resetStore = () => useAuthStore.setState({
  user: null, accessToken: null, refreshToken: null,
  isLoading: false, isInitialized: false, error: null, isDemoMode: false,
});

// Prevent jsdom navigation errors (window.location.href = '...')
const originalLocation = window.location;
beforeAll(() => {
  delete window.location;
  window.location = { href: '', pathname: '/', assign: vi.fn(), replace: vi.fn() };
});
afterAll(() => {
  window.location = originalLocation;
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetStore();
});

// ─── login() ──────────────────────────────────────────────────────────────────

describe('authStore.login()', () => {
  it('sets user, tokens, and sessionStorage on success', async () => {
    const result = await useAuthStore.getState().login('admin@test.com', 'Test@1234');

    expect(result.success).toBe(true);
    const state = useAuthStore.getState();
    expect(state.user).not.toBeNull();
    expect(state.user.email).toBe('admin@test.com');
    expect(state.accessToken).toBe('mock-access-token');
    expect(localStorage.getItem('accessToken')).toBe('mock-access-token');
    expect(localStorage.getItem('refreshToken')).toBe('mock-refresh-token');
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
  });

  it('returns error message on wrong credentials', async () => {
    const result = await useAuthStore.getState().login('admin@test.com', 'wrongpassword');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('returns network error message when server is unreachable', async () => {
    // Override handler to simulate network failure
    const { server } = await import('../mocks/server');
    const { rest } = await import('msw');
    server.use(
      rest.post('http://localhost/api/v1/auth/login', (req, res) => res.networkError('Connection refused'))
    );

    const result = await useAuthStore.getState().login('admin@test.com', 'Test@1234');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/connect/i);
  });

  it('sets isLoading true during request and false after', async () => {
    const promise = useAuthStore.getState().login('admin@test.com', 'Test@1234');
    expect(useAuthStore.getState().isLoading).toBe(true);
    await promise;
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

// ─── logout() ─────────────────────────────────────────────────────────────────

describe('authStore.logout()', () => {
  it('clears user, tokens, and sessionStorage', async () => {
    // First login
    await useAuthStore.getState().login('admin@test.com', 'Test@1234');
    expect(useAuthStore.getState().user).not.toBeNull();

    // Then logout
    await useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

// ─── initialize() ─────────────────────────────────────────────────────────────

describe('authStore.initialize()', () => {
  it('sets isInitialized=true and fetches user when token is valid', async () => {
    localStorage.setItem('accessToken', 'mock-access-token');
    useAuthStore.setState({ accessToken: 'mock-access-token' });

    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.isInitialized).toBe(true);
    expect(state.user).not.toBeNull();
  });

  it('sets isInitialized=true and clears state when token is invalid', async () => {
    // Use a refresh-token-style token so the interceptor navigates instead of retrying
    localStorage.setItem('accessToken', 'bad-token-no-refresh');
    localStorage.removeItem('refreshToken');
    useAuthStore.setState({ accessToken: 'bad-token-no-refresh' });

    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.isInitialized).toBe(true);
    expect(state.user).toBeNull();
  });

  it('sets isInitialized=true immediately when no token stored', async () => {
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isInitialized).toBe(true);
    expect(useAuthStore.getState().user).toBeNull();
  });
});

// ─── role helpers ─────────────────────────────────────────────────────────────

describe('authStore role helpers', () => {
  const setRole = (role) => useAuthStore.setState({ user: { id: '1', role } });

  it('isAdmin() returns true for super_admin', () => {
    setRole('super_admin');
    expect(useAuthStore.getState().isAdmin()).toBe(true);
  });

  it('isAdmin() returns true for admin', () => {
    setRole('admin');
    expect(useAuthStore.getState().isAdmin()).toBe(true);
  });

  it('isAdmin() returns false for site_engineer', () => {
    setRole('site_engineer');
    expect(useAuthStore.getState().isAdmin()).toBe(false);
  });

  it('hasRole() matches any role in array', () => {
    setRole('qs_engineer');
    expect(useAuthStore.getState().hasRole(['admin', 'qs_engineer'])).toBe(true);
    expect(useAuthStore.getState().hasRole(['admin', 'accountant'])).toBe(false);
  });

  it('isPM(), isQS(), isHSE() detect respective roles', () => {
    setRole('project_manager');
    expect(useAuthStore.getState().isPM()).toBe(true);
    expect(useAuthStore.getState().isQS()).toBe(false);

    setRole('qs_engineer');
    expect(useAuthStore.getState().isQS()).toBe(true);

    setRole('hse_officer');
    expect(useAuthStore.getState().isHSE()).toBe(true);
  });
});
