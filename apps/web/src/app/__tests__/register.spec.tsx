import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegisterPage from '../auth/register/page';

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

describe('RegisterPage', () => {
  it('renders the registration heading', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Criar sua conta')).toBeInTheDocument();
  });

  it('renders all registration form fields', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText('Nome completo')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('has required attribute on name, email, cpf and password', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText('Nome completo')).toBeRequired();
    expect(screen.getByLabelText('E-mail')).toBeRequired();
    expect(screen.getByLabelText('CPF')).toBeRequired();
    expect(screen.getByLabelText('Senha')).toBeRequired();
  });

  it('formats CPF input as user types', () => {
    render(<RegisterPage />);
    const cpfInput = screen.getByLabelText('CPF');
    fireEvent.change(cpfInput, { target: { value: '12345678901' } });
    expect((cpfInput as HTMLInputElement).value).toBe('123.456.789-01');
  });

  it('formats partial CPF correctly', () => {
    render(<RegisterPage />);
    const cpfInput = screen.getByLabelText('CPF');
    fireEvent.change(cpfInput, { target: { value: '123' } });
    expect((cpfInput as HTMLInputElement).value).toBe('123');
    fireEvent.change(cpfInput, { target: { value: '1234' } });
    expect((cpfInput as HTMLInputElement).value).toBe('123.4');
    fireEvent.change(cpfInput, { target: { value: '1234567' } });
    expect((cpfInput as HTMLInputElement).value).toBe('123.456.7');
  });

  it('shows error when terms are not accepted', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('aceitar os termos');
    });
  });

  it('calls API on submit when all fields are filled and terms accepted', async () => {
    const fetchMock = mockFetch({ accessToken: 'new-token' });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      const registerCall = fetchMock.mock.calls.find(
        ([url]: [string]) => url.includes('/auth/register'),
      );
      expect(registerCall).toBeDefined();
      const body = JSON.parse(registerCall[1].body);
      expect(body.name).toBe('Test User');
      expect(body.email).toBe('test@test.com');
      expect(body.cpf).toBe('12345678901');
      expect(body.password).toBe('password123');
    });
  });

  it('stores token and redirects after successful registration', async () => {
    mockFetch({ accessToken: 'new-token-xyz' });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(localStorage.getItem('vintage_token')).toBe('new-token-xyz');
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('shows error on duplicate email', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/auth/csrf-token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ csrfToken: 'test-csrf-token' }),
          text: () => Promise.resolve('{"csrfToken":"test-csrf-token"}'),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ message: 'Email already exists' }),
        text: () => Promise.resolve('Email already exists'),
      });
    });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'existing@test.com' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows loading text while submitting', async () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(screen.getByText('Criando conta...')).toBeInTheDocument();
  });

  it('renders link to login page', () => {
    render(<RegisterPage />);
    const link = screen.getByText('Entrar');
    expect(link.closest('a')).toHaveAttribute('href', '/auth/login');
  });
});
