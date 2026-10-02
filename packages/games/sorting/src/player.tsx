'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { mediaUrl, type PlayerRendererProps, type Translate } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import type { SortingItemView, SortingPlayerView } from './schema.js';

type Answering = Extract<SortingPlayerView, { phase: 'ANSWERING' }>;

const moveButton =
  'grid size-12 shrink-0 place-items-center rounded-xl bg-surface-raised text-2xl font-bold active:scale-95 disabled:opacity-30';

function ItemBody({ item }: { item: SortingItemView }) {
  return (
    <>
      {item.mediaId && (
        <img
          src={mediaUrl(item.mediaId)}
          alt=""
          className="h-12 w-16 shrink-0 rounded-lg bg-black/20 object-cover"
        />
      )}
      <span className="min-w-0 flex-1 leading-tight font-semibold">{item.text}</span>
    </>
  );
}

/**
 * One row of the list. Dragging starts from the handle only (after a short press on touch
 * screens, so the page still scrolls); the arrows are the non-drag fallback (SPEC §7.3).
 */
function SortableRow({
  item,
  index,
  count,
  onMove,
  t,
}: {
  item: SortingItemView;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  t: Translate;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      data-testid="sorting-item"
      data-item-id={item.id}
      className={`bg-surface flex min-h-[64px] items-center gap-3 rounded-2xl px-2 py-2 ${
        isDragging ? 'ring-brand relative z-10 shadow-2xl ring-4' : ''
      }`}
      style={{
        transform: CSS.Translate.toString(transform && { ...transform, x: 0 }),
        transition,
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        data-testid="sorting-handle"
        aria-label={t('dragHandle', { item: item.text })}
        className="text-muted grid min-h-[48px] w-10 shrink-0 cursor-grab touch-none place-items-center text-2xl"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="text-muted w-5 shrink-0 text-center font-bold tabular-nums">
        {index + 1}
      </span>
      <ItemBody item={item} />
      <button
        type="button"
        data-testid="sorting-up"
        aria-label={t('moveUp', { item: item.text })}
        className={moveButton}
        disabled={index === 0}
        onClick={() => {
          onMove(index, index - 1);
        }}
      >
        ↑
      </button>
      <button
        type="button"
        data-testid="sorting-down"
        aria-label={t('moveDown', { item: item.text })}
        className={moveButton}
        disabled={index === count - 1}
        onClick={() => {
          onMove(index, index + 1);
        }}
      >
        ↓
      </button>
    </li>
  );
}

function SortingForm({
  view,
  submit,
  haptic,
  describeError,
  t,
}: Pick<PlayerRendererProps<Answering>, 'view' | 'submit' | 'haptic' | 'describeError' | 't'>) {
  const [order, setOrder] = useState(
    () => view.submittedOrder ?? view.items.map((item) => item.id),
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(view.items.map((item) => [item.id, item]));
  const sentSame =
    view.submittedOrder !== null && view.submittedOrder.join('\n') === order.join('\n');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    haptic();
    setOrder(arrayMove(order, from, to));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(order.indexOf(String(active.id)), order.indexOf(String(over.id)));
  };

  const send = async () => {
    if (sending) return;
    haptic();
    setSending(true);
    setError(null);
    const outcome = await submit({ order });
    setSending(false);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  return (
    <div className="flex flex-1 flex-col gap-3" data-testid="sorting-player-answering">
      <p className="font-display text-lg leading-tight font-bold">{view.question}</p>
      {view.labels && <p className="text-muted text-sm">▲ {view.labels.first}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {order.map((id, index) => {
              const item = byId.get(id);
              return item ? (
                <SortableRow
                  key={id}
                  item={item}
                  index={index}
                  count={order.length}
                  onMove={move}
                  t={t}
                />
              ) : null;
            })}
          </ol>
        </SortableContext>
      </DndContext>
      {view.labels && <p className="text-muted text-sm">▼ {view.labels.last}</p>}
      <button
        type="button"
        data-testid="sorting-submit"
        disabled={sending || sentSame}
        onClick={() => void send()}
        className="bg-brand min-h-touch mt-auto rounded-3xl px-6 py-4 text-2xl font-extrabold text-white transition-transform active:scale-95 disabled:opacity-40"
      >
        {view.submittedOrder ? t('update') : t('send')}
      </button>
      {view.submittedOrder && (
        <p className="text-muted text-center text-sm" data-testid="sorting-sent">
          {t('sentCanChange')}
        </p>
      )}
      {error && (
        <p
          role="alert"
          data-testid="sorting-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Phone controller for a sorting question (SPEC §7.3). */
export function SortingPlayer({
  view,
  submit,
  haptic,
  describeError,
  t,
}: PlayerRendererProps<SortingPlayerView>) {
  if (view.phase === 'INTRO') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="sorting-player-intro"
      >
        <p className="text-muted">{t('lookAtScreen')}</p>
        <p className="font-display text-2xl font-bold">{view.question}</p>
      </div>
    );
  }

  if (view.phase === 'ANSWERING') {
    if (!view.locked) {
      return (
        <SortingForm
          view={view}
          submit={submit}
          haptic={haptic}
          describeError={describeError}
          t={t}
        />
      );
    }
    const byId = new Map(view.items.map((item) => [item.id, item]));
    return (
      <div className="flex flex-1 flex-col gap-3" data-testid="sorting-player-locked">
        <p className="font-display text-center text-2xl font-bold">{t('answerLocked')}</p>
        <ol className="flex flex-col gap-2">
          {(view.submittedOrder ?? []).map((id, index) => {
            const item = byId.get(id);
            return item ? (
              <li key={id} className="bg-surface flex items-center gap-3 rounded-2xl px-4 py-3">
                <span className="text-muted w-5 font-bold tabular-nums">{index + 1}</span>
                <ItemBody item={item} />
              </li>
            ) : null;
          })}
        </ol>
        <p className="text-muted text-center">{t('waitForOthers')}</p>
      </div>
    );
  }

  const verdict =
    view.correct === null ? t('noAnswer') : view.correct ? t('allCorrect') : t('wrongOrder');
  const tone =
    view.correct === null
      ? 'bg-surface-raised'
      : view.correct
        ? 'bg-success text-canvas'
        : 'bg-danger';
  return (
    <div
      className="flex flex-1 flex-col gap-3"
      data-testid="sorting-player-reveal"
      data-correct={String(view.correct)}
    >
      <p
        className={`font-display rounded-3xl px-6 py-6 text-center text-3xl font-extrabold ${tone}`}
      >
        {verdict}
      </p>
      {view.correctPositions !== null && (
        <p className="text-center">
          {t('placedCount', { count: view.correctPositions, total: view.correctOrder.length })}
        </p>
      )}
      <p className="text-muted text-sm">{t('rightOrder')}</p>
      <ol className="flex flex-col gap-2">
        {view.correctOrder.map((item, index) => {
          const mine = view.submittedOrder?.[index];
          const right = mine === item.id;
          return (
            <li
              key={item.id}
              data-testid="sorting-reveal-item"
              data-right={view.submittedOrder ? String(right) : undefined}
              className="bg-surface flex items-center gap-3 rounded-2xl px-4 py-3"
            >
              <span className="text-muted w-5 font-bold tabular-nums">{index + 1}</span>
              <ItemBody item={item} />
              {view.submittedOrder && (
                <span
                  aria-label={right ? t('inPlace') : t('notInPlace')}
                  className={right ? 'text-success text-xl' : 'text-danger text-xl'}
                >
                  {right ? '✓' : '✗'}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
