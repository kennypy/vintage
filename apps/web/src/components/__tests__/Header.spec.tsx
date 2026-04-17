import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Header from '../Header';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('Header', () => {
  it('shows Entrar and Criar conta when not authenticated', () => {
    render(<Header />);
    expect(screen.getByText('Entrar')).toBeInTheDocument();
    expect(screen.getByText('Criar conta')).toBeInTheDocument();
  });

  it('shows Minha conta and Sair when authenticated', () => {
    localStorage.setItem('vintage_token', 'test-token');
    render(<Header />);
    expect(screen.getByText('Minha conta')).toBeInTheDocument();
    expect(screen.getByText('Sair')).toBeInTheDocument();
  });

  it('does not show login buttons when authenticated', () => {
    localStorage.setItem('vintage_token', 'test-token');
    render(<Header />);
    expect(screen.queryByText('Entrar')).not.toBeInTheDocument();
    expect(screen.queryByText('Criar conta')).not.toBeInTheDocument();
  });

  it('does not show profile/logout when not authenticated', () => {
    render(<Header />);
    expect(screen.queryByText('Minha conta')).not.toBeInTheDocument();
    expect(screen.queryByText('Sair')).not.toBeInTheDocument();
  });

  it('clears token and redirects on logout', () => {
    localStorage.setItem('vintage_token', 'test-token');
    render(<Header />);
    fireEvent.click(screen.getByText('Sair'));
    expect(localStorage.getItem('vintage_token')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('navigates to listings with search query on form submit', () => {
    render(<Header />);
    const input = screen.getByPlaceholderText('Buscar roupas, marcas, estilos...');
    fireEvent.change(input, { target: { value: 'vestido' } });
    fireEvent.submit(input.closest('form')!);
    expect(mockPush).toHaveBeenCalledWith('/listings?q=vestido');
  });

  it('renders the logo linking to home', () => {
    render(<Header />);
    const logo = screen.getByText('Vintage.br');
    expect(logo.closest('a')).toHaveAttribute('href', '/');
  });

  it('renders Explorar and Vender nav links', () => {
    render(<Header />);
    expect(screen.getByText('Explorar')).toBeInTheDocument();
    expect(screen.getByText('Vender')).toBeInTheDocument();
  });
});
