import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SellPage from '../sell/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function mockFetch(body: unknown, status = 200) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
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

  it('renders the sell form with all fields', () => {
    render(<SellPage />);
    expect(screen.getByLabelText('Titulo')).toBeInTheDocument();
    expect(screen.getByLabelText('Descricao')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toBeInTheDocument();
    expect(screen.getByLabelText('Preco (R$)')).toBeInTheDocument();
    expect(screen.getByLabelText('Peso (g)')).toBeInTheDocument();
    expect(screen.getByLabelText('Marca')).toBeInTheDocument();
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

  it('renders category select options', () => {
    render(<SellPage />);
    const select = screen.getByLabelText('Categoria');
    expect(select).toBeInTheDocument();

    // Check some categories exist as options
    const options = select.querySelectorAll('option');
    const optionTexts = Array.from(options).map((o) => o.textContent);
    expect(optionTexts).toContain('Vestidos');
    expect(optionTexts).toContain('Calcas');
    expect(optionTexts).toContain('Sapatos');
  });

  it('submits listing to API and redirects', async () => {
    const fetchMock = mockFetch({ id: 'new-listing-id' });
    render(<SellPage />);

    fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Vestido Farm' } });
    fireEvent.change(screen.getByLabelText('Descricao'), { target: { value: 'Lindo vestido' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Vestidos' } });
    fireEvent.change(screen.getByLabelText('Preco (R$)'), { target: { value: '89.90' } });

    fireEvent.click(screen.getByRole('button', { name: 'Publicar anuncio' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toContain('/listings');
    const body = JSON.parse(callArgs[1].body);
    expect(body.title).toBe('Vestido Farm');
    expect(body.description).toBe('Lindo vestido');
    expect(body.category).toBe('Vestidos');
    expect(body.price).toBe(89.9);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/listings/new-listing-id');
    });
  });

  it('shows error on API failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Server error' }),
      text: () => Promise.resolve('Server error'),
    });
    render(<SellPage />);

    fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Descricao'), { target: { value: 'Test desc' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Vestidos' } });
    fireEvent.change(screen.getByLabelText('Preco (R$)'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Publicar anuncio' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows loading text while submitting', async () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<SellPage />);

    fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Descricao'), { target: { value: 'Test desc' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Vestidos' } });
    fireEvent.change(screen.getByLabelText('Preco (R$)'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Publicar anuncio' }));

    expect(screen.getByText('Publicando...')).toBeInTheDocument();
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

  it('displays photo count after selection', async () => {
    render(<SellPage />);

    const file = new File(['photo-content'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    Object.defineProperty(input, 'files', {
      value: [file],
    });
    fireEvent.change(input);

    expect(screen.getByText('1 foto(s) selecionada(s)')).toBeInTheDocument();
  });
});
