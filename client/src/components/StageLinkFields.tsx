import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { apiGet } from '../lib/api';
import type { CircuitListItem, StageLink } from '../lib/circuits';

interface Props {
  value: StageLink | null;
  onChange: (value: StageLink | null) => void;
}

/** Whether a tournament is a stage of a circuit: the circuit, then its category. */
export function StageLinkFields({ value, onChange }: Props) {
  const { t } = useI18n();
  const [circuits, setCircuits] = useState<CircuitListItem[] | null>(null);

  useEffect(() => {
    apiGet<CircuitListItem[]>('/circuits')
      .then(setCircuits)
      .catch(() => setCircuits([]));
  }, []);

  const circuit = circuits?.find((c) => c.id === value?.circuitId);

  // A circuit given without a valid category (e.g. 'New stage'): its first one; unknown: none
  useEffect(() => {
    if (!circuits || !value) return;
    if (!circuit) onChange(null);
    else if (!circuit.categories.some((c) => c.id === value.categoryId)) {
      onChange({ circuitId: circuit.id, categoryId: circuit.categories[0]?.id ?? '' });
    }
  }, [circuits, circuit, value, onChange]);

  if (!circuits) return <p className="muted">{t.common.loading}</p>;

  return (
    <div className="stage-link">
      <p className="muted">{circuits.length > 0 ? t.stageLink.hint : t.stageLink.noCircuits}</p>
      <div className="inline-fields">
        <label>
          {t.stageLink.circuit}
          <select
            value={value?.circuitId ?? ''}
            onChange={(e) => {
              const next = circuits.find((c) => c.id === e.target.value);
              onChange(
                next ? { circuitId: next.id, categoryId: next.categories[0]?.id ?? '' } : null,
              );
            }}
          >
            <option value="">{t.stageLink.none}</option>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.season ? `${c.name} · ${c.season}` : c.name}
              </option>
            ))}
          </select>
        </label>
        {circuit && value && (
          <label>
            {t.stageLink.category}
            <select
              value={value.categoryId}
              onChange={(e) => onChange({ ...value, categoryId: e.target.value })}
            >
              {circuit.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
