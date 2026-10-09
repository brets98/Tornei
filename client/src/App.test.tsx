import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { authClient } from './lib/auth-client';
import { FakeEventSource } from './test/fake-event-source';

vi.mock('./lib/auth-client');

const mocked = vi.mocked(authClient, { deep: true });

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function signedOut() {
  mocked.useSession.mockReturnValue({ data: null, isPending: false } as never);
}

function signedInAs(role: string) {
  mocked.useSession.mockReturnValue({
    data: { user: { name: 'Mario', surname: 'Rossi', email: 'mario@example.com', role } },
    isPending: false,
  } as never);
}

/** Simulates the server pushing the latest result to the page. */
function pushResult() {
  act(() =>
    FakeEventSource.latest().emit({
      text: 'Team A 2 - 1 Team B',
      publishedAt: '2026-10-09T18:00:00.000Z',
    }),
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signed out', () => {
    it('shows the public landing page with the latest result', async () => {
      signedOut();
      renderAt('/');

      pushResult();
      expect(screen.getByText('Team A 2 - 1 Team B')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    });

    it('shows the sign-in form for pages that need an account', () => {
      signedOut();
      renderAt('/users');

      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('signs up with name and surname, then asks to verify the email', async () => {
      signedOut();
      mocked.signUp.email.mockResolvedValue({ data: {}, error: null } as never);
      renderAt('/sign-in');

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
      renderAt('/sign-in');

      fill('Email', 'mario@example.com');
      fill('Password', 'correct-horse-battery');
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByText(/verify your email first/)).toBeInTheDocument();
    });
  });

  describe('signed in', () => {
    it('shows the landing page with the menu and the current user', () => {
      signedInAs('user');
      renderAt('/');

      expect(screen.getByRole('heading', { name: 'Welcome to Tornei' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Change password' })).toBeInTheDocument();
      expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
    });

    it('hides the Users menu item from regular users', () => {
      signedInAs('user');
      renderAt('/');
      expect(screen.queryByRole('link', { name: 'Results' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    });

    it('shows the Results and Users menu items to admins', () => {
      signedInAs('admin');
      renderAt('/');
      expect(screen.getByRole('link', { name: 'Results' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    });

    it('shows the latest result on the home page', async () => {
      signedInAs('user');
      renderAt('/');

      pushResult();
      expect(screen.getByText('Team A 2 - 1 Team B')).toBeInTheDocument();
    });

    it('shows a not-found page for unknown paths', () => {
      signedInAs('user');
      renderAt('/nope');

      expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    });

    it('signs out', () => {
      signedInAs('user');
      mocked.signOut.mockResolvedValue({} as never);
      renderAt('/');

      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

      expect(mocked.signOut).toHaveBeenCalled();
    });
  });
});
