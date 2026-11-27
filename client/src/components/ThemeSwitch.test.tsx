import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderIn } from '../test/render';
import { ThemeSwitch } from './ThemeSwitch';

describe('ThemeSwitch', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('follows the device until a theme is chosen, and remembers the choice', () => {
    renderIn('it', <ThemeSwitch />);
    const select = screen.getByLabelText('Tema');
    expect(select).toHaveValue('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();

    fireEvent.change(select, { target: { value: 'dark' } });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('tornei.theme')).toBe('dark');

    fireEvent.change(select, { target: { value: 'system' } });
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('tornei.theme')).toBeNull();
  });

  it('starts from the saved theme', () => {
    localStorage.setItem('tornei.theme', 'light');
    renderIn('it', <ThemeSwitch />);
    expect(screen.getByLabelText('Tema')).toHaveValue('light');
  });
});
