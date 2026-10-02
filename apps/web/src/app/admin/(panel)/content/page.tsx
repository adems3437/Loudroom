'use client';

import {
  categorySchema,
  contentItemSchema,
  contentStatSchema,
  pageSchema,
  type ContentStat,
  type ContentStatus,
  type Difficulty,
} from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import {
  formatDate,
  inputClass,
  LoadState,
  PageHeader,
  Pagination,
  smallButton,
  StatusBadge,
  tableClass,
  tdClass,
  thClass,
  useApiData,
} from '@/admin/ui';
import { summarize } from '@/admin/content-form';
import { GAME_TYPES } from '@/games/registry';

const contentPageSchema = pageSchema(contentItemSchema);
const categoriesSchema = categorySchema.array();
const contentStatsSchema = contentStatSchema.array();
const PAGE_SIZE = 25;

interface Filters {
  gameType: string;
  status: ContentStatus | '';
  categoryId: string;
  difficulty: Difficulty | '';
  q: string;
}

const NO_FILTERS: Filters = { gameType: '', status: '', categoryId: '', difficulty: '', q: '' };

/** How often the item was played and how many got it right (from game history). */
function PlayStats({ stat }: { stat: ContentStat | undefined }) {
  const t = useTranslations('admin.content');
  if (!stat) return <span className="text-muted text-sm">{t('notPlayed')}</span>;
  return (
    <span className="text-sm" data-testid="content-stats">
      {t('playStats', { rounds: stat.rounds, answers: stat.answers })}
      {stat.correctRate !== null && (
        <span className="text-muted block">
          {t('correctRate', { rate: Math.round(stat.correctRate * 100) })}
        </span>
      )}
    </span>
  );
}

export default function ContentListPage() {
  const t = useTranslations('admin');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  for (const [key, value] of Object.entries(filters) as [string, string][]) {
    if (value) query.set(key, value);
  }
  const { state } = useApiData(`/api/admin/content?${query.toString()}`, contentPageSchema);
  const categories = useApiData('/api/admin/categories', categoriesSchema).state;
  const ids = state.status === 'ready' ? state.data.items.map((item) => item.id) : [];
  const stats = useApiData(
    ids.length > 0 ? `/api/admin/stats/content?ids=${ids.join(',')}` : null,
    contentStatsSchema,
  ).state;
  const statOf = (id: string) =>
    stats.status === 'ready' ? stats.data.find((stat) => stat.contentItemId === id) : undefined;
  const categoryName = (id: string | null) =>
    (categories.status === 'ready' && categories.data.find((c) => c.id === id)?.name) ||
    t('content.noCategory');

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title={t('content.title')}
        actions={
          <>
            <Link
              href="/admin/content/import"
              data-testid="content-import"
              className={smallButton()}
            >
              {t('content.import')}
            </Link>
            {GAME_TYPES.map((gameType) => (
              <Link
                key={gameType}
                href={`/admin/content/new?gameType=${gameType}`}
                data-testid={`content-new-${gameType}`}
                className={smallButton('primary')}
              >
                {t('content.new')} · {t(`gameTypes.${gameType}` as 'gameTypes.quiz')}
              </Link>
            ))}
          </>
        }
      />

      <form
        className="mb-4 grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter('q', search.trim());
        }}
      >
        <input
          type="search"
          data-testid="content-search"
          aria-label={t('common.search')}
          placeholder={t('content.searchPlaceholder')}
          className={inputClass}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            if (event.target.value === '') setFilter('q', '');
          }}
        />
        <select
          aria-label={t('content.gameType')}
          className={inputClass}
          value={filters.gameType}
          onChange={(event) => {
            setFilter('gameType', event.target.value);
          }}
        >
          <option value="">
            {t('content.gameType')}: {t('common.all')}
          </option>
          {GAME_TYPES.map((gameType) => (
            <option key={gameType} value={gameType}>
              {t(`gameTypes.${gameType}` as 'gameTypes.quiz')}
            </option>
          ))}
        </select>
        <select
          aria-label={t('content.status')}
          className={inputClass}
          value={filters.status}
          onChange={(event) => {
            setFilter('status', event.target.value as Filters['status']);
          }}
        >
          <option value="">
            {t('content.status')}: {t('common.all')}
          </option>
          <option value="DRAFT">{t('status.DRAFT')}</option>
          <option value="PUBLISHED">{t('status.PUBLISHED')}</option>
        </select>
        <select
          aria-label={t('content.category')}
          className={inputClass}
          value={filters.categoryId}
          onChange={(event) => {
            setFilter('categoryId', event.target.value);
          }}
        >
          <option value="">
            {t('content.category')}: {t('common.all')}
          </option>
          {categories.status === 'ready' &&
            categories.data.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
        <select
          aria-label={t('content.difficulty')}
          className={inputClass}
          value={filters.difficulty}
          onChange={(event) => {
            setFilter('difficulty', event.target.value as Filters['difficulty']);
          }}
        >
          <option value="">
            {t('content.difficulty')}: {t('common.all')}
          </option>
          {(['EASY', 'MEDIUM', 'HARD'] as const).map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {t(`difficulty.${difficulty}`)}
            </option>
          ))}
        </select>
      </form>

      {state.status !== 'ready' ? (
        <LoadState state={state} />
      ) : state.data.items.length === 0 ? (
        <p className="text-muted">{t('common.empty')}</p>
      ) : (
        <>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>{t('content.item')}</th>
                <th className={thClass}>{t('content.category')}</th>
                <th className={thClass}>{t('content.difficulty')}</th>
                <th className={thClass}>{t('content.status')}</th>
                <th className={thClass}>{t('content.played')}</th>
                <th className={thClass}>{t('content.updatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((item) => (
                <tr key={item.id} data-testid="content-row" data-content-id={item.id}>
                  <td className={tdClass}>
                    <Link
                      href={`/admin/content/${item.id}`}
                      className="hover:text-brand-strong font-semibold"
                    >
                      {summarize(item) ?? t('common.none')}
                    </Link>
                    <span className="text-muted block text-sm">
                      {t(`gameTypes.${item.gameType}` as 'gameTypes.quiz')}
                      {item.tags.length > 0 && ` · ${item.tags.join(', ')}`}
                    </span>
                  </td>
                  <td className={tdClass}>{categoryName(item.categoryId)}</td>
                  <td className={tdClass}>{t(`difficulty.${item.difficulty}`)}</td>
                  <td className={tdClass}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td className={tdClass}>
                    <PlayStats stat={statOf(item.id)} />
                  </td>
                  <td className={`${tdClass} text-muted text-sm`}>{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={state.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
