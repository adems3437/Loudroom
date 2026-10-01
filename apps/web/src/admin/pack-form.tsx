'use client';

import {
  categorySchema,
  contentItemSchema,
  pageSchema,
  packSchema,
  TIME_LIMIT_MAX_MS,
  TIME_LIMIT_MIN_MS,
  type ApiError,
  type ContentItem,
  type ContentStatus,
  type Difficulty,
  type Pack,
  type PackInput,
  type PackRoundInput,
} from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { GAME_TYPES } from '@/games/registry';
import { summarize } from './content-form';
import { useAdminSession } from './session';
import {
  ConfirmDelete,
  ErrorBanner,
  Field,
  inputClass,
  Notice,
  smallButton,
  StatusBadge,
  useApiData,
} from './ui';

const categoriesSchema = categorySchema.array();
const contentPageSchema = pageSchema(contentItemSchema);

/** A round being edited; numbers stay strings until saving. */
interface RoundDraft {
  key: number;
  gameType: string;
  mode: 'fixed' | 'random';
  contentIds: string[];
  categoryId: string;
  difficulty: Difficulty | '';
  questionCount: string;
  timeLimitSec: string;
  scoreMultiplier: string;
  showScoreboardAfter: boolean;
}

let nextKey = 1;

function newRound(): RoundDraft {
  return {
    key: nextKey++,
    gameType: GAME_TYPES[0] ?? 'quiz',
    mode: 'fixed',
    contentIds: [],
    categoryId: '',
    difficulty: '',
    questionCount: '10',
    timeLimitSec: '',
    scoreMultiplier: '1',
    showScoreboardAfter: true,
  };
}

function draftOf(round: Pack['rounds'][number]): RoundDraft {
  const selection = round.contentSelection;
  return {
    key: nextKey++,
    gameType: round.gameType,
    mode: selection.mode,
    contentIds: selection.mode === 'fixed' ? selection.contentIds : [],
    categoryId: selection.mode === 'random' ? (selection.categoryId ?? '') : '',
    difficulty: selection.mode === 'random' ? (selection.difficulty ?? '') : '',
    questionCount: String(round.questionCount),
    timeLimitSec: round.timeLimitMs ? String(round.timeLimitMs / 1000) : '',
    scoreMultiplier: String(round.scoreMultiplier),
    showScoreboardAfter: round.showScoreboardAfter,
  };
}

function toInput(round: RoundDraft): PackRoundInput {
  return {
    gameType: round.gameType,
    contentSelection:
      round.mode === 'fixed'
        ? { mode: 'fixed', contentIds: round.contentIds }
        : {
            mode: 'random',
            ...(round.categoryId ? { categoryId: round.categoryId } : {}),
            ...(round.difficulty ? { difficulty: round.difficulty } : {}),
          },
    questionCount:
      round.mode === 'fixed' ? Math.max(1, round.contentIds.length) : Number(round.questionCount),
    timeLimitMs: round.timeLimitSec.trim()
      ? Math.round(Number(round.timeLimitSec.replace(',', '.')) * 1000)
      : null,
    scoreMultiplier: Number(round.scoreMultiplier.replace(',', '.')),
    showScoreboardAfter: round.showScoreboardAfter,
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** Fixed content list of a round: chosen items in play order, plus a searchable list to add from. */
function FixedContent({
  round,
  onChange,
  known,
  remember,
}: {
  round: RoundDraft;
  onChange: (contentIds: string[]) => void;
  known: Map<string, ContentItem>;
  remember: (items: ContentItem[]) => void;
}) {
  const t = useTranslations('admin');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const query = new URLSearchParams({ gameType: round.gameType, pageSize: '20' });
  if (q) query.set('q', q);
  const { state } = useApiData(`/api/admin/content?${query.toString()}`, contentPageSchema);

  useEffect(() => {
    if (state.status === 'ready') remember(state.data.items);
  }, [state, remember]);

  const label = (id: string) => {
    const item = known.get(id);
    return item ? (summarize(item) ?? id) : id;
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h4 className="mb-2 text-sm font-semibold">
          {t('packs.selected', { count: round.contentIds.length })}
        </h4>
        <ol className="flex flex-col gap-2" data-testid="pack-selected">
          {round.contentIds.map((id, index) => (
            <li
              key={id}
              data-testid="pack-selected-item"
              data-content-id={id}
              className="bg-canvas border-line flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            >
              <span className="text-muted tabular-nums">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{label(id)}</span>
              {known.get(id) && <StatusBadge status={known.get(id)?.status ?? 'DRAFT'} />}
              <button
                type="button"
                aria-label={t('packs.moveUp')}
                className={smallButton('ghost', 'px-2 py-1')}
                disabled={index === 0}
                onClick={() => {
                  onChange(move(round.contentIds, index, index - 1));
                }}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t('packs.moveDown')}
                className={smallButton('ghost', 'px-2 py-1')}
                disabled={index === round.contentIds.length - 1}
                onClick={() => {
                  onChange(move(round.contentIds, index, index + 1));
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className={smallButton('ghost', 'px-2 py-1')}
                onClick={() => {
                  onChange(round.contentIds.filter((other) => other !== id));
                }}
              >
                {t('packs.remove')}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold">{t('packs.available')}</h4>
        <input
          type="search"
          data-testid="pack-content-search"
          aria-label={t('common.search')}
          placeholder={t('content.searchPlaceholder')}
          className={`${inputClass} mb-2`}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              setQ(search.trim());
            }
          }}
        />
        <ul className="flex max-h-72 flex-col gap-2 overflow-auto">
          {state.status === 'ready' &&
            state.data.items
              .filter((item) => !round.contentIds.includes(item.id))
              .map((item) => (
                <li
                  key={item.id}
                  className="border-line flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{summarize(item) ?? item.id}</span>
                  <StatusBadge status={item.status} />
                  <button
                    type="button"
                    data-testid="pack-content-add"
                    data-content-id={item.id}
                    className={smallButton('ghost', 'px-2 py-1')}
                    onClick={() => {
                      onChange([...round.contentIds, item.id]);
                    }}
                  >
                    {t('packs.add')}
                  </button>
                </li>
              ))}
        </ul>
      </div>
    </div>
  );
}

/** Create or edit a game pack (SPEC §6). Publishing is checked by the server. */
export function PackForm({ pack }: { pack: Pack | null }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const { api } = useAdminSession();
  const categories = useApiData('/api/admin/categories', categoriesSchema).state;
  const [name, setName] = useState(pack?.name ?? '');
  const [description, setDescription] = useState(pack?.description ?? '');
  const [status, setStatus] = useState<ContentStatus>(pack?.status ?? 'DRAFT');
  const [rounds, setRounds] = useState<RoundDraft[]>(() =>
    pack ? pack.rounds.map(draftOf) : [newRound()],
  );
  const [known, setKnown] = useState(() => new Map<string, ContentItem>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  const remember = useCallback((items: ContentItem[]) => {
    setKnown((current) => {
      if (items.every((item) => current.get(item.id) === item)) return current;
      const next = new Map(current);
      for (const item of items) next.set(item.id, item);
      return next;
    });
  }, []);

  // Names of the items already in the pack's fixed lists.
  useEffect(() => {
    const ids = pack?.rounds.flatMap((round) =>
      round.contentSelection.mode === 'fixed' ? round.contentSelection.contentIds : [],
    );
    if (!ids?.length) return;
    void Promise.all(
      ids.map((id) => api(`/api/admin/content/${id}`, { schema: contentItemSchema })),
    ).then((results) => {
      remember(results.flatMap((result) => (result.ok ? [result.data] : [])));
    });
  }, [pack, api, remember]);

  const update = (index: number, patch: Partial<RoundDraft>) => {
    setRounds(rounds.map((round, i) => (i === index ? { ...round, ...patch } : round)));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const input: PackInput = {
      name,
      description: description.trim() || null,
      status,
      rounds: rounds.map(toInput),
    };
    const result = pack
      ? await api(`/api/admin/packs/${pack.id}`, { method: 'PUT', json: input, schema: packSchema })
      : await api('/api/admin/packs', { method: 'POST', json: input, schema: packSchema });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    if (!pack) router.replace(`/admin/game-packs/${result.data.id}`);
  };

  const remove = async () => {
    if (!pack) return;
    const result = await api(`/api/admin/packs/${pack.id}`, { method: 'DELETE' });
    if (result.ok) router.replace('/admin/game-packs');
    else setError(result.error);
  };

  const packIssues = error?.code === 'PACK_INVALID' ? (error.issues ?? []) : [];

  return (
    <form
      data-testid="pack-form"
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <section className="bg-surface border-line grid grid-cols-[2fr_1fr] gap-4 rounded-2xl border p-6">
        <Field label={t('packs.name')}>
          <input
            data-testid="pack-name"
            required
            maxLength={80}
            className={inputClass}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
        <Field label={t('content.status')} hint={t('packs.publishHint')}>
          <select
            data-testid="pack-status"
            className={inputClass}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ContentStatus);
            }}
          >
            <option value="DRAFT">{t('status.DRAFT')}</option>
            <option value="PUBLISHED">{t('status.PUBLISHED')}</option>
          </select>
        </Field>
        <div className="col-span-2">
          <Field label={t('packs.description')}>
            <textarea
              maxLength={500}
              className={`${inputClass} min-h-20`}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          </Field>
        </div>
      </section>

      <h2 className="font-display text-2xl font-bold">{t('packs.rounds')}</h2>
      {rounds.map((round, index) => (
        <section
          key={round.key}
          data-testid="pack-round"
          className="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-6"
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold">{t('packs.round', { number: index + 1 })}</h3>
            <span className="flex gap-2">
              <button
                type="button"
                aria-label={t('packs.moveUp')}
                className={smallButton()}
                disabled={index === 0}
                onClick={() => {
                  setRounds(move(rounds, index, index - 1));
                }}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t('packs.moveDown')}
                className={smallButton()}
                disabled={index === rounds.length - 1}
                onClick={() => {
                  setRounds(move(rounds, index, index + 1));
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className={smallButton('ghost', 'text-danger')}
                onClick={() => {
                  setRounds(rounds.filter((_, i) => i !== index));
                }}
              >
                {t('packs.removeRound')}
              </button>
            </span>
          </header>

          <div className="grid grid-cols-4 gap-4">
            <Field label={t('packs.gameType')}>
              <select
                className={inputClass}
                value={round.gameType}
                onChange={(event) => {
                  update(index, { gameType: event.target.value, contentIds: [] });
                }}
              >
                {GAME_TYPES.map((gameType) => (
                  <option key={gameType} value={gameType}>
                    {t(`gameTypes.${gameType}` as 'gameTypes.quiz')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('packs.timeLimit')} hint={t('packs.timeLimitHint')}>
              <input
                type="number"
                min={TIME_LIMIT_MIN_MS / 1000}
                max={TIME_LIMIT_MAX_MS / 1000}
                className={inputClass}
                value={round.timeLimitSec}
                onChange={(event) => {
                  update(index, { timeLimitSec: event.target.value });
                }}
              />
            </Field>
            <Field label={t('packs.multiplier')}>
              <input
                type="number"
                min={0.5}
                max={5}
                step={0.5}
                className={inputClass}
                value={round.scoreMultiplier}
                onChange={(event) => {
                  update(index, { scoreMultiplier: event.target.value });
                }}
              />
            </Field>
            <label className="flex items-center gap-2 self-center">
              <input
                type="checkbox"
                className="accent-brand size-5"
                checked={round.showScoreboardAfter}
                onChange={(event) => {
                  update(index, { showScoreboardAfter: event.target.checked });
                }}
              />
              {t('packs.scoreboardAfter')}
            </label>
          </div>

          <fieldset className="flex items-center gap-6">
            <legend className="mb-2 font-semibold">{t('packs.selection')}</legend>
            {(['fixed', 'random'] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`mode-${round.key}`}
                  data-testid={`pack-mode-${mode}`}
                  className="accent-brand size-5"
                  checked={round.mode === mode}
                  onChange={() => {
                    update(index, { mode });
                  }}
                />
                {t(`packs.${mode}`)}
              </label>
            ))}
          </fieldset>

          {round.mode === 'fixed' ? (
            <FixedContent
              round={round}
              known={known}
              remember={remember}
              onChange={(contentIds) => {
                update(index, { contentIds });
              }}
            />
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <Field label={t('content.category')}>
                <select
                  className={inputClass}
                  value={round.categoryId}
                  onChange={(event) => {
                    update(index, { categoryId: event.target.value });
                  }}
                >
                  <option value="">{t('packs.anyCategory')}</option>
                  {categories.status === 'ready' &&
                    categories.data.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t('content.difficulty')}>
                <select
                  className={inputClass}
                  value={round.difficulty}
                  onChange={(event) => {
                    update(index, { difficulty: event.target.value as Difficulty | '' });
                  }}
                >
                  <option value="">{t('packs.anyDifficulty')}</option>
                  {(['EASY', 'MEDIUM', 'HARD'] as const).map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {t(`difficulty.${difficulty}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('packs.questionCount')}>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={inputClass}
                  value={round.questionCount}
                  onChange={(event) => {
                    update(index, { questionCount: event.target.value });
                  }}
                />
              </Field>
            </div>
          )}
        </section>
      ))}
      <button
        type="button"
        data-testid="pack-add-round"
        className={smallButton('ghost', 'self-start')}
        onClick={() => {
          setRounds([...rounds, newRound()]);
        }}
      >
        {t('packs.addRound')}
      </button>

      {packIssues.length > 0 ? (
        <div
          role="alert"
          data-testid="pack-issues"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          <p className="font-semibold">{t('packs.issues.title')}</p>
          <ul className="list-disc pl-5">
            {packIssues.map((issue, i) => (
              <li key={i} data-code={issue.code}>
                {t(`packs.issues.${issue.code as 'NO_ROUNDS'}`, {
                  round: typeof issue.path[1] === 'number' ? issue.path[1] + 1 : 1,
                  available: issue.message,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ErrorBanner error={error} />
      )}
      {saved && <Notice>{t('common.saved')}</Notice>}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          data-testid="pack-save"
          disabled={busy}
          className={smallButton('primary', 'px-8 py-3')}
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
        {pack && <ConfirmDelete testId="pack-delete" onConfirm={() => void remove()} />}
      </div>
    </form>
  );
}
