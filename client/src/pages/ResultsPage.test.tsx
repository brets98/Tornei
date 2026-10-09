import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultsPage } from './ResultsPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('ResultsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is not available to regular users', () => {
    render(<ResultsPage isAdmin={false} />);

    expect(screen.getByText(/Only administrators/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('lets admins publish a result', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST' ? json({ id: '1', text: 'Team A 1 - 0 Team B' }, 201) : json(null),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<ResultsPage isAdmin />);

    fireEvent.change(screen.getByLabelText('New result'), {
      target: { value: 'Team A 1 - 0 Team B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Result published.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Team A 1 - 0 Team B' }),
    });
    expect(screen.getByLabelText('New result')).toHaveValue('');
  });

  it('shows an error when publishing fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(init?.method === 'POST' ? json({ error: 'Forbidden' }, 403) : json(null)),
      ),
    );
    render(<ResultsPage isAdmin />);

    fireEvent.change(screen.getByLabelText('New result'), { target: { value: '1 - 0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Could not publish the result.')).toBeInTheDocument();
  });
});
