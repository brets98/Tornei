import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { LanguageProvider } from './i18n/LanguageProvider';
import { authClient } from './lib/auth-client';
import { FakeEventSource } from './test/fake-event-source';

vi.mock('./lib/auth-client');

const mocked = vi.mocked(authClient, { deep: true });

function renderAt(path: string) {
  // Like main.tsx: the language comes from the saved choice or the browser (English in jsdom)
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </LanguageProvider>,
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

/** The health check tells the sign-in page whether registration is open. */
function registration(open: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json({ status: 'ok', signUp: open }))),
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The signed-in home loads the tournament list
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
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
      registration(true);
      mocked.signUp.email.mockResolvedValue({ data: {}, error: null } as never);
      renderAt('/sign-in');

      fireEvent.click(await screen.findByRole('button', { name: 'Create an account' }));
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

    it('does not offer registration while it is closed', async () => {
      signedOut();
      registration(false);
      renderAt('/sign-in');

      expect(
        await screen.findByRole('button', { name: 'Forgot your password?' }),
      ).toBeInTheDocument();
      await act(() => Promise.resolve());
      expect(screen.queryByRole('button', { name: 'Create an account' })).not.toBeInTheDocument();
    });

    it('explains a Google sign-in refused because registration is closed', () => {
      signedOut();
      registration(false);
      renderAt('/sign-in?error=signup_disabled');

      expect(screen.getByText(/Registration is closed/)).toBeInTheDocument();
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
    it('shows the tournament list with the menu and the current user', async () => {
      signedInAs('user');
      renderAt('/');

      expect(screen.getByRole('heading', { name: 'My tournaments' })).toBeInTheDocument();
      expect(
        await screen.findByText("You haven't created any tournament yet."),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Tournaments' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Change password' })).toBeInTheDocument();
      expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
    });

    it('switches the whole interface between English and Italian, remembering the choice', async () => {
      signedInAs('user');
      renderAt('/');
      await screen.findByText("You haven't created any tournament yet.");

      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'it' } });

      expect(screen.getByRole('heading', { name: 'I miei tornei' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Cambia password' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Esci' })).toBeInTheDocument();
      expect(document.documentElement.lang).toBe('it');
      expect(localStorage.getItem('tornei.language')).toBe('it');

      fireEvent.change(screen.getByLabelText('Lingua'), { target: { value: 'en' } });
      expect(screen.getByRole('heading', { name: 'My tournaments' })).toBeInTheDocument();
    });

    it('starts in the language chosen before', () => {
      localStorage.setItem('tornei.language', 'it');
      signedInAs('user');
      renderAt('/');

      expect(screen.getByRole('heading', { name: 'I miei tornei' })).toBeInTheDocument();
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
