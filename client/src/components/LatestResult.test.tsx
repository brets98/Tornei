import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LatestResult } from './LatestResult';

function mockFetch(...responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const { status, body } of responses) {
    fn.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('LatestResult', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the latest result', async () => {
    mockFetch({
      status: 200,
      body: { text: 'Team A 2 - 1 Team B', publishedAt: '2026-10-09T18:00:00.000Z' },
    });

    render(<LatestResult />);

    expect(await screen.findByText('Team A 2 - 1 Team B')).toBeInTheDocument();
    expect(screen.getByText(/^Updated/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/results/latest', undefined);
  });

  it('says when nothing has been published', async () => {
    mockFetch({ status: 200, body: null });

    render(<LatestResult />);

    expect(await screen.findByText('No result has been published yet.')).toBeInTheDocument();
  });

  it('shows an error when the result cannot be loaded', async () => {
    mockFetch({ status: 500, body: {} });

    render(<LatestResult />);

    expect(await screen.findByText('Could not load the result.')).toBeInTheDocument();
  });

  it('reloads when refreshKey changes', async () => {
    mockFetch(
      { status: 200, body: { text: 'Old', publishedAt: '2026-10-09T18:00:00.000Z' } },
      { status: 200, body: { text: 'New', publishedAt: '2026-10-09T18:05:00.000Z' } },
    );

    const { rerender } = render(<LatestResult refreshKey={0} />);
    expect(await screen.findByText('Old')).toBeInTheDocument();

    rerender(<LatestResult refreshKey={1} />);
    expect(await screen.findByText('New')).toBeInTheDocument();
  });
});
