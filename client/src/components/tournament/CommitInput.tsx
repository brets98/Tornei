import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & {
  /** The saved value */
  value: string;
  /** Called on blur or Enter, only if the text changed */
  onCommit: (value: string) => void;
};

/**
 * A text field that saves when you leave it (or press Enter), not on every keystroke.
 * While you type it shows your draft; afterwards it shows the saved value again.
 */
export function CommitInput({ value, onCommit, onKeyDown, ...props }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  }

  return (
    <input
      {...props}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        onKeyDown?.(e);
      }}
    />
  );
}
