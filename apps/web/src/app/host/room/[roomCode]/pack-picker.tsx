'use client';

import { publicPackSchema, type PublicPack } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

const listSchema = publicPackSchema.array();

type Packs = { status: 'loading' } | { status: 'error' } | { status: 'ready'; packs: PublicPack[] };

/** Published packs from GET /api/packs (SPEC §15 Phase 4: the host picks a pack to play). */
export function usePublishedPacks(): Packs {
  const [state, setState] = useState<Packs>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    void apiRequest('/api/packs', { schema: listSchema }).then((result) => {
      if (active)
        setState(result.ok ? { status: 'ready', packs: result.data } : { status: 'error' });
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}

export function PackPicker({
  packs,
  selected,
  onSelect,
}: {
  packs: Packs;
  selected: string | null;
  onSelect: (packId: string) => void;
}) {
  const t = useTranslations('host');
  if (packs.status !== 'ready') {
    return (
      <p className={`text-[28px] ${packs.status === 'error' ? 'text-danger' : 'text-muted'}`}>
        {packs.status === 'error' ? t('packsFailed') : t('loading')}
      </p>
    );
  }
  if (packs.packs.length === 0) {
    return (
      <p role="status" data-testid="no-packs" className="text-warning text-[28px]">
        {t('noPacks')}
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="text-muted text-[26px] tracking-widest uppercase">{t('packHeading')}</h2>
      <ul
        className="flex gap-4 overflow-x-auto pb-2"
        role="radiogroup"
        aria-label={t('packHeading')}
      >
        {packs.packs.map((pack) => {
          const active = pack.id === selected;
          return (
            <li key={pack.id} className="shrink-0">
              <button
                type="button"
                role="radio"
                aria-checked={active}
                data-testid="pack-option"
                data-pack-id={pack.id}
                className={`flex max-w-[460px] flex-col items-start rounded-3xl border-4 px-6 py-3 text-left ${
                  active
                    ? 'border-accent bg-surface-raised'
                    : 'bg-surface hover:bg-surface-raised border-transparent'
                }`}
                onClick={() => {
                  onSelect(pack.id);
                }}
              >
                <span className="max-w-full truncate text-[32px] font-bold">{pack.name}</span>
                <span className="text-muted text-[26px]">
                  {t('packQuestions', { count: pack.questionCount })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
