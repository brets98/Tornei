import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeEventSource } from '../test/fake-event-source';
import { LatestResult } from './LatestResult';

const push = (data: unknown) => act(() => FakeEventSource.latest().emit(data));

describe('LatestResult', () => {
  it('listens to the live result stream', () => {
    render(<LatestResult />);

    expect(FakeEventSource.latest().url).toBe('/api/results/stream');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the result sent on connect, then each new one as it is pushed', () => {
    render(<LatestResult />);

    push({ text: 'Team A 1 - 0 Team B', publishedAt: '2026-10-09T18:00:00.000Z' });
    expect(screen.getByText('Team A 1 - 0 Team B')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();

    push({ text: 'Team A 2 - 0 Team B', publishedAt: '2026-10-09T18:05:00.000Z' });
    expect(screen.getByText('Team A 2 - 0 Team B')).toBeInTheDocument();
    expect(screen.queryByText('Team A 1 - 0 Team B')).not.toBeInTheDocument();
  });

  it('says when nothing has been published', () => {
    render(<LatestResult />);

    push(null);

    expect(screen.getByText('No result has been published yet.')).toBeInTheDocument();
  });

  it('keeps the last result and shows when the connection is down', () => {
    render(<LatestResult />);
    push({ text: 'Team A 1 - 0 Team B', publishedAt: '2026-10-09T18:00:00.000Z' });

    act(() => FakeEventSource.latest().fail());

    expect(screen.getByText('Team A 1 - 0 Team B')).toBeInTheDocument();
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });

  it('shows an error if it cannot connect at all', () => {
    render(<LatestResult />);

    act(() => FakeEventSource.latest().fail());

    expect(screen.getByText('Could not load the result.')).toBeInTheDocument();
  });

  it('closes the connection when it is no longer shown', () => {
    const { unmount } = render(<LatestResult />);

    unmount();

    expect(FakeEventSource.latest().closed).toBe(true);
  });
});
