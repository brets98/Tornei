import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { authClient } from './lib/auth-client';

vi.mock('./lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const mocked = vi.mocked(authClient, { deep: true });

function signedOut() {
  mocked.useSession.mockReturnValue({ data: null, isPending: false } as never);
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the sign-in form when signed out', () => {
    signedOut();
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('signs up with name and surname, then asks to verify the email', async () => {
    signedOut();
    mocked.signUp.email.mockResolvedValue({ data: {}, error: null } as never);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fill('Name', 'Mario');
    fill('Surname', 'Rossi');
    fill('Email', 'mario@example.com');
    fill('Password', 'correct-horse-battery');
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
    expect(mocked.signUp.email).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Mario', surname: 'Rossi', email: 'mario@example.com' }),
    );
  });

  it('tells unverified users to check their email', async () => {
    signedOut();
    mocked.signIn.email.mockResolvedValue({
      data: null,
      error: { status: 403, message: 'Email not verified' },
    } as never);
    render(<App />);

    fill('Email', 'mario@example.com');
    fill('Password', 'correct-horse-battery');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/verify your email first/)).toBeInTheDocument();
  });

  it('shows the signed-in user and signs out', () => {
    mocked.useSession.mockReturnValue({
      data: { user: { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' } },
      isPending: false,
    } as never);
    render(<App />);

    expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocked.signOut).toHaveBeenCalled();
  });
});
