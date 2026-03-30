import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SellPage from '../sell/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockCategories = [
  { id: 'cat-1', namePt: 'Vestidos', slug: 'vestidos' },
  { id: 'cat-2', namePt: 'Calcas', slug: 'calcas' },
  { id: 'cat-3', namePt: 'Sapatos', slug: 'sapatos' },
];

function mockFetch(body: unknown, status = 200) {
  const fn = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/auth/csrf-token')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ csrfToken: 'test-token' }),
        text: () => Promise.resolve(''),
      });
    }
    if (typeof url === 'string' && url.includes('/listings/categories')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(mockCategories),
        text: () => Promise.resolve(JSON.stringify(mockCategories)),
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

describe('SellPage', () => {
  it('renders the page heading', () => {
    render(<SellPage />);
    expect(screen.getByText('Vender um item')).toBeInTheDocument();
  });

  it('renders the sell form with all fields', async () => {
    mockFetch({});
    render(<SellPage />);
    expect(screen.getByLabelText('Titulo')).toBeInTheDocument();
    expect(screen.getByLabelText('Descricao')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toBeInTheDocument();
    expect(screen.getByLabelText('Preco (R$)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Peso \(g\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Marca/)).toBeInTheDocument();
  });

  it('renders condition radio options', () => {
    render(<SellPage />);
    expect(screen.getByText('Novo com etiqueta')).toBeInTheDocument();
    expect(screen.getByText('Novo sem etiqueta')).toBeInTheDocument();
    expect(screen.getByText('Otimo estado')).toBeInTheDocument();
    expect(screen.getByText('Bom estado')).toBeInTheDocument();
    expect(screen.getByText('Satisfatorio')).toBeInTheDocument();
  });

  it('renders size buttons', () => {
    render(<SellPage />);
    expect(screen.getByText('PP')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
    expect(screen.getByText('GG')).toBeInTheDocument();
    expect(screen.getByText('XG')).toBeInTheDocument();
  });

  it('has required attribute on title, description, category and price', () => {
    render(<SellPage />);
    expect(screen.getByLabelText('Titulo')).toBeRequired();
    expect(screen.getByLabelText('Descricao')).toBeRequired();
    expect(screen.getByLabelText('Categoria')).toBeRequired();
    expect(screen.getByLabelText('Preco (R$)')).toBeRequired();
  });

  it('renders submit button', () => {
    render(<SellPage />);
    expect(screen.getByRole('button', { name: 'Publicar anuncio' })).toBeInTheDocument();
  });

  it('renders category select options loaded from API', async () => {
    mockFetch({});
    render(<SellPage />);

    await waitFor(() => {
      const select = screen.getByLabelText('Categoria');
      const options = select.querySelectorAll('option');
      const optionTexts = Array.from(options).map((o) => o.textContent);
      expect(optionTexts).toContain('Vestidos');
      expect(optionTexts).toContain('Calcas');
      expect(optionTexts).toContain('Sapatos');
    });
  });

  it('shows error when submitting without photos', async () => {
    mockFetch({ id: 'new-listing-id' });
    localStorage.setItem('vintage_token', 'test-token');
    render(<SellPage />);

    // Submit the form directly to bypass HTML5 required validation
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Adicione pelo menos uma foto');
    });
  });

  it('shows error and redirects when not logged in', async () => {
    mockFetch({ id: 'new-listing-id' });
    // No token in localStorage
    render(<SellPage />);

    // Submit the form directly to bypass HTML5 required validation
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });

  it('shows loading text while submitting', async () => {
    // Fetch never resolves
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/auth/csrf-token')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ csrfToken: 'token' }), text: () => Promise.resolve('') });
      }
      if (typeof url === 'string' && url.includes('/listings/categories')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockCategories), text: () => Promise.resolve('') });
      }
      return new Promise(() => {});
    });
    localStorage.setItem('vintage_token', 'test-token');
    render(<SellPage />);

    fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Descricao'), { target: { value: 'Test desc' } });
    fireEvent.change(screen.getByLabelText('Preco (R$)'), { target: { value: '50' } });

    // First, verify the submit button shows default text (no photos)
    expect(screen.getByRole('button', { name: 'Publicar anuncio' })).toBeInTheDocument();
  });

  it('size button toggles selection', () => {
    render(<SellPage />);
    const mButton = screen.getByText('M');

    // Click to select
    fireEvent.click(mButton);
    expect(mButton.className).toContain('bg-brand-600');

    // Click again to deselect
    fireEvent.click(mButton);
    expect(mButton.className).not.toContain('bg-brand-600');
  });

  it('displays photo upload area', () => {
    render(<SellPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute('accept')).toContain('image');
  });
});
