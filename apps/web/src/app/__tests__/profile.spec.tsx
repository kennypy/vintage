import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfilePage from '../profile/page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockReplace }),
}));

const mockUser = { id: 'user-1', name: 'Ana Silva', email: 'ana@test.com' };

function mockFetchMe(ok: boolean) {
  global.fetch = jest.fn().mockImplementation(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 401,
      json: () => Promise.resolve(mockUser),
      text: () => Promise.resolve(JSON.stringify(mockUser)),
    }),
  );
}

describe('ProfilePage (redirect surface)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockReplace.mockClear();
  });

  it('redirects unauthenticated visitors to /auth/login', async () => {
    render(<ProfilePage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/login'));
  });

  it('redirects authenticated users to their public seller profile', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    mockFetchMe(true);
    render(<ProfilePage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/seller/user-1'));
  });

  it('redirects to /auth/login when /users/me fails', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    mockFetchMe(false);
    render(<ProfilePage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/login'));
  });
});
