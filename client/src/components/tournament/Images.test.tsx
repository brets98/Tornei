import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tournament } from '../../lib/tournaments';
import { renderIn } from '../../test/render';
import { mockActions, tournament as base } from '../../test/tournament-fixtures';
import { GroupsBoard } from './GroupsBoard';
import { ImagesPanel, TournamentLogo } from './Images';

// jsdom can't decode or draw images: pretend the file is already ready to upload
vi.mock('../../lib/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/images')>()),
  prepareImage: vi.fn(async (file: File) => file),
}));

const withImages: Tournament = { ...base, images: { logo: 'i1', background: 'i2' } };

describe('tournament images', () => {
  it('uploads, replaces and removes the logo and the background', async () => {
    const actions = mockActions();
    const { unmount } = renderIn('it', <ImagesPanel tournament={base} actions={actions} />);

    expect(screen.getAllByText('Nessuna immagine')).toHaveLength(2);
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Logo: Scegli immagine'), {
      target: { files: [file] },
    });
    await waitFor(() => expect(actions.setImage).toHaveBeenCalledWith('logo', file));

    unmount();
    renderIn('it', <ImagesPanel tournament={withImages} actions={actions} />);
    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute('src', '/api/images/i1');
    expect(screen.getByLabelText('Sfondo: Sostituisci immagine')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rimuovi' })[1]);
    expect(actions.setImage).toHaveBeenCalledWith('background', null);
  });

  it('shows the logo and puts the background behind each group', () => {
    const { container } = render(
      <>
        <TournamentLogo tournament={withImages} />
        <GroupsBoard tournament={withImages} />
      </>,
    );
    expect(container.querySelector('.tournament-logo')).toHaveAttribute('src', '/api/images/i1');
    const bodies = container.querySelectorAll<HTMLElement>('.group-body.watermarked');
    expect(bodies).toHaveLength(2);
    expect(bodies[0].style.getPropertyValue('--watermark')).toBe('url("/api/images/i2")');
  });

  it('shows nothing without images', () => {
    const { container } = render(
      <>
        <TournamentLogo tournament={base} />
        <GroupsBoard tournament={base} />
      </>,
    );
    expect(container.querySelector('.tournament-logo')).toBeNull();
    expect(container.querySelector('.watermarked')).toBeNull();
  });
});
