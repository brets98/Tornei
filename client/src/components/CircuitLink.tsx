import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { fill, useI18n } from '../i18n/context';
import { apiGet } from '../lib/api';
import type { CircuitListItem, StageLink } from '../lib/circuits';

/** 'Stage of Summer circuit · P1', linking to the circuit. */
export function CircuitLink({ link }: { link: StageLink }) {
  const { t } = useI18n();
  const [circuit, setCircuit] = useState<CircuitListItem | null>(null);

  useEffect(() => {
    apiGet<CircuitListItem[]>('/circuits')
      .then((circuits) => setCircuit(circuits.find((c) => c.id === link.circuitId) ?? null))
      .catch(() => setCircuit(null));
  }, [link.circuitId]);

  if (!circuit) return null;
  const category = circuit.categories.find((c) => c.id === link.categoryId)?.name ?? '';
  return (
    <Link to={`/circuits/${circuit.id}`}>
      {fill(t.stageLink.stageOf, { circuit: circuit.name, category })}
    </Link>
  );
}
