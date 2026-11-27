import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderIn } from '../test/render';
import { Layout } from './Layout';

vi.mock('../lib/auth-client');

const user = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };

function renderLayout() {
  return renderIn(
    'it',
    <MemoryRouter>
      <Layout user={user} />
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('hides the menu to use the whole width, and shows it again', () => {
    const { container } = renderLayout();
    expect(screen.getByRole('navigation', { name: 'Menu principale' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Nascondi menu' }));
    expect(container.querySelector('.layout')).toHaveClass('menu-hidden');
    expect(localStorage.getItem('tornei.menu')).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Mostra menu' }));
    expect(container.querySelector('.layout')).not.toHaveClass('menu-hidden');
    expect(localStorage.getItem('tornei.menu')).toBeNull();
  });

  it('remembers a hidden menu', () => {
    localStorage.setItem('tornei.menu', 'hidden');
    const { container } = renderLayout();
    expect(container.querySelector('.layout')).toHaveClass('menu-hidden');
    expect(screen.getByRole('button', { name: 'Mostra menu' })).toBeInTheDocument();
  });
});
