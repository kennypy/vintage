import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '../auth/login/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

function mockFetch(body: unknown, status = 200) {
  const fn = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/auth/csrf-token')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ csrfToken: 'test-csrf-token' }),
        text: () => Promise.resolve(JSON.stringify({ csrfToken: 'test-csrf-token' })),
      });
    }
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
  global.fetch = fn;
  return fn;
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
  localStorage.clear();
});

describe('LoginPage', () => {
  it('renders the login heading', () => {
    render(<LoginPage />);
    expect(screen.getByText('Entrar na sua conta')).toBeInTheDocument();
  });

  it('renders email and password fields', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('has required attribute on email and password inputs', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('E-mail')).toBeRequired();
    expect(screen.getByLabelText('Senha')).toBeRequired();
  });

  it('calls API on form submit', async () => {
    const fetchMock = mockFetch({ accessToken: 'test-token-123' });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      const loginCall = fetchMock.mock.calls.find(
        ([url]: [string]) => url.includes('/auth/login') && !url.includes('csrf'),
      );
      expect(loginCall).toBeDefined();
      // captchaToken is null until the Turnstile widget solves (it never
      // does under jsdom). The backend CaptchaGuard no-ops when
      // CAPTCHA_ENFORCE=false, so null is the correct wire value here.
      expect(JSON.parse(loginCall[1].body)).toEqual({
        email: 'user@test.com',
        password: 'password123',
        captchaToken: null,
      });
    });
  });

  it('marks the browser as signed-in after a successful login', async () => {
    // Cookie migration: the JWT itself lives in an HttpOnly cookie set
    // by the API and is invisible to JS. What remains in localStorage
    // is a non-secret presence marker ("1") that layout-level auth
    // gates read to decide whether to render account chrome.
    mockFetch({ accessToken: 'my-token-abc', refreshToken: 'r-1' });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(localStorage.getItem('vintage_token')).toBe('1');
    });
  });

  it('redirects to home after successful login', async () => {
    mockFetch({ accessToken: 'my-token-abc' });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('shows error on invalid credentials', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/auth/csrf-token')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ csrfToken: 'token' }), text: () => Promise.resolve('') });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid credentials' }),
        text: () => Promise.resolve('Invalid credentials'),
      });
    });
    render(<LoginPage />);

    // Password is a realistic-shape value (>=8 chars) so the new client-side
    // validateLoginForm gate doesn't short-circuit before the API call. The
    // gate is intentional — `password='wrong'` (5 chars) used to round-trip
    // to the API and show its 401 message; we now reject it locally with
    // "A senha tem no mínimo 8 caracteres." for faster feedback.
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong-pwd-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows loading text while submitting', async () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Entrando...')).toBeInTheDocument();
  });

  it('renders link to registration page', () => {
    render(<LoginPage />);
    const link = screen.getByText('Criar conta');
    expect(link.closest('a')).toHaveAttribute('href', '/auth/register');
  });
});
