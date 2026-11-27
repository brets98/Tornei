import { useState } from 'react';
import { useI18n } from '../../i18n/context';
import {
  IMAGE_ACCEPT,
  IMAGE_KINDS,
  imageUrl,
  prepareImage,
  type ImageKind,
} from '../../lib/images';
import type { Tournament } from '../../lib/tournaments';
import type { TournamentActions } from './actions';

/** The tournament's logo, beside its name; nothing when it has none. */
export function TournamentLogo({ tournament }: { tournament: Pick<Tournament, 'images'> }) {
  const id = tournament.images?.logo;
  return id ? <img className="tournament-logo" src={imageUrl(id)} alt="" /> : null;
}

/** Settings: upload, replace or remove the logo and the background, each saved at once. */
export function ImagesPanel({
  tournament,
  actions,
}: {
  tournament: Tournament;
  actions: TournamentActions;
}) {
  const { t } = useI18n();
  const [error, setError] = useState('');

  async function choose(kind: ImageKind, file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      actions.setImage(kind, await prepareImage(file, kind));
    } catch {
      setError(t.images.unreadable);
    }
  }

  return (
    <div className="panel settings">
      <h3>{t.images.title}</h3>
      <p className="muted">{t.images.hint}</p>
      <div className="image-fields">
        {IMAGE_KINDS.map((kind) => {
          const id = tournament.images?.[kind];
          return (
            <div key={kind} className="image-field">
              <h4>{t.images[kind]}</h4>
              <p className="muted">{t.images.hints[kind]}</p>
              <div className={`image-preview ${kind}`}>
                {id ? (
                  <img src={imageUrl(id)} alt={t.images[kind]} />
                ) : (
                  <span className="muted">{t.images.none}</span>
                )}
              </div>
              <div className="row-actions">
                <label className="button secondary">
                  {id ? t.images.replace : t.images.choose}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    hidden
                    aria-label={`${t.images[kind]}: ${id ? t.images.replace : t.images.choose}`}
                    onChange={(e) => {
                      void choose(kind, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {id && (
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() => actions.setImage(kind, null)}
                  >
                    {t.images.remove}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
