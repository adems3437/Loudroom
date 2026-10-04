'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import { useState, type ReactNode } from 'react';
import {
  OKEY_HAND_CHOICES,
  OKEY_POINT_CHOICES,
  type OkeyEvent,
  type OkeyHostView,
} from './schema.js';
import { isOkey, SeatAvatar, seatName, tileFor } from './seat.js';
import { TileBack, TileFace } from './tile.js';

type Props = HostRendererProps<OkeyHostView>;
type Table = Extract<OkeyHostView, { phase: 'TURN' | 'TALLY' }>;
type Seat = Table['seats'][number];

function Choice<Value extends number | boolean>({
  label,
  options,
  value,
  onChange,
  text,
  testId,
}: {
  label: string;
  options: readonly Value[];
  value: Value;
  onChange: (value: Value) => void;
  text: (value: Value) => string;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-6">
      <span className="text-muted w-[320px] text-[32px] font-bold">{label}</span>
      <div className="flex gap-4" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option)}
            type="button"
            data-testid={`${testId}-${String(option)}`}
            aria-pressed={option === value}
            onClick={() => {
              onChange(option);
            }}
            className={`min-w-[120px] rounded-2xl px-8 py-4 text-[36px] font-extrabold ${
              option === value ? 'bg-accent text-canvas' : 'bg-surface'
            }`}
          >
            {text(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Before the deal: the host picks the hands, the starting points and partners. */
function Setup({
  view,
  players,
  Avatar,
  t,
  sendHostInput,
}: Pick<Props, 'players' | 'Avatar' | 't' | 'sendHostInput'> & {
  view: Extract<OkeyHostView, { phase: 'SETUP' }>;
}) {
  const [hands, setHands] = useState(view.defaults.hands);
  const [startPoints, setStartPoints] = useState(view.defaults.startPoints);
  const [teams, setTeams] = useState(view.defaults.teams);
  const [busy, setBusy] = useState(false);
  const handOptions = OKEY_HAND_CHOICES.includes(hands as never)
    ? [...OKEY_HAND_CHOICES]
    : [...OKEY_HAND_CHOICES, hands].sort((a, b) => a - b);
  const pointOptions = OKEY_POINT_CHOICES.includes(startPoints as never)
    ? [...OKEY_POINT_CHOICES]
    : [...OKEY_POINT_CHOICES, startPoints].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-8" data-testid="okey-setup">
      <ol className="flex gap-6">
        {view.seats.map((seat, index) => (
          <li
            key={seat.id}
            className="bg-surface flex items-center gap-4 rounded-3xl px-5 py-3"
            data-testid="okey-setup-seat"
            data-bot={seat.bot !== null}
          >
            <SeatAvatar seat={seat} players={players} Avatar={Avatar} size={56} />
            <span className="text-[28px] font-bold">{seatName(seat, players, t)}</span>
            {teams && (
              <span className="text-muted text-[22px]">
                {t('sideName', { side: (index % 2) + 1 })}
              </span>
            )}
          </li>
        ))}
      </ol>
      <Choice
        label={t('handsLabel')}
        options={handOptions}
        value={hands}
        onChange={setHands}
        text={String}
        testId="okey-hands"
      />
      <Choice
        label={t('pointsLabel')}
        options={pointOptions}
        value={startPoints}
        onChange={setStartPoints}
        text={String}
        testId="okey-points"
      />
      <Choice
        label={t('modeLabel')}
        options={[false, true]}
        value={teams}
        onChange={setTeams}
        text={(value) => (value ? t('modeTeams') : t('modeSolo'))}
        testId="okey-teams"
      />
      <button
        type="button"
        data-testid="okey-start"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void sendHostInput({ type: 'start', hands, startPoints, teams }).then((outcome) => {
            if (!outcome.ok) setBusy(false);
          });
        }}
        className="bg-brand self-start rounded-3xl px-14 py-5 text-[44px] font-extrabold disabled:opacity-50"
      >
        {t('start')}
      </button>
    </div>
  );
}

function lastText(last: OkeyEvent, name: (id: string) => string, t: Props['t']): ReactNode {
  return t(`last.${last.kind}`, { name: name(last.seat) });
}

/** A seat at the table: who, how many tiles, the side's points, and their discard pile. */
function SeatPanel({
  seat,
  view,
  players,
  Avatar,
  t,
  className,
}: {
  seat: Seat;
  view: Table;
  players: Props['players'];
  Avatar: Props['Avatar'];
  t: Props['t'];
  className: string;
}) {
  const active = view.phase === 'TURN' && view.turn === seat.id;
  const away = seat.bot === null && !players.find((p) => p.id === seat.id)?.connected;
  return (
    <div
      className={`flex items-center gap-4 rounded-3xl px-5 py-3 transition-[background-color,transform] duration-300 ${className} ${
        active ? 'bg-surface-raised ring-success scale-105 ring-4' : 'bg-surface'
      } ${away ? 'opacity-50' : ''}`}
      data-testid="okey-seat"
      data-seat={seat.id}
      data-active={active}
      data-count={seat.count}
    >
      <SeatAvatar seat={seat} players={players} Avatar={Avatar} size={64} />
      <div className="flex min-w-0 flex-col">
        <span className="max-w-[230px] truncate text-[28px] font-bold">
          {seatName(seat, players, t)}
        </span>
        <span className="text-muted text-[22px] tabular-nums">
          {t('tiles', { count: seat.count })} ·{' '}
          {t('points', { points: view.sides[seat.side]?.points ?? 0 })}
        </span>
        {active && view.bot && (
          <span className="text-accent text-[22px] font-bold">{t('botPlaying')}</span>
        )}
      </div>
      <div className="flex flex-col items-center gap-1" data-testid="okey-discard">
        {seat.discard !== null ? (
          <TileFace id={seat.discard} size="md" />
        ) : (
          <span className="border-line h-[84px] w-[62px] rounded-lg border-[3px] border-dashed" />
        )}
        <span className="text-muted text-[18px]">{t('discarded')}</span>
      </div>
    </div>
  );
}

function TableView(props: Props & { view: Table }) {
  const { view, players, Avatar, t } = props;
  const seat = (index: number) => view.seats[index];
  const name = (id: string) => {
    const found = view.seats.find((s) => s.id === id);
    return found ? seatName(found, players, t) : '?';
  };
  const panel = (index: number, className: string) => {
    const s = seat(index);
    return s ? (
      <SeatPanel
        seat={s}
        view={view}
        players={players}
        Avatar={Avatar}
        t={t}
        className={className}
      />
    ) : (
      <span />
    );
  };
  return (
    <div className="grid flex-1 grid-cols-[1fr_auto_1fr] grid-rows-[auto_1fr_auto] items-center gap-4 p-3">
      <div />
      {panel(2, 'justify-self-center')}
      <div />
      {panel(3, 'justify-self-start')}
      <div
        className="bg-okey-felt flex flex-col items-center gap-4 rounded-[40px] px-12 py-6"
        data-testid="okey-center"
      >
        <div className="flex items-end gap-10">
          <div
            className="flex flex-col items-center gap-2"
            data-testid="okey-deck"
            data-count={view.deckCount}
          >
            <TileBack size="lg" />
            <span className="text-[24px] font-bold tabular-nums">
              {t('deck', { count: view.deckCount })}
            </span>
          </div>
          <div className="flex flex-col items-center gap-2" data-testid="okey-indicator">
            <TileFace id={view.indicator} size="lg" />
            <span className="text-[24px] font-bold">{t('indicator')}</span>
          </div>
          <div className="flex flex-col items-center gap-2" data-testid="okey-okey">
            <TileFace id={tileFor(view.okey)} size="md" wild />
            <span className="text-[24px] font-bold">{t('okey')}</span>
          </div>
        </div>
        <p className="min-h-[36px] text-[28px]" data-testid="okey-last">
          {view.last ? lastText(view.last, name, t) : t('firstTurn', { name: name(view.turn) })}
        </p>
      </div>
      {panel(1, 'justify-self-end')}
      <div />
      {panel(0, 'justify-self-center')}
      <div />
    </div>
  );
}

/** The scoreboard after a hand: who finished and how, the hand in groups, points lost. */
function Tally({ view, players, t }: Props & { view: Extract<OkeyHostView, { phase: 'TALLY' }> }) {
  const { tally } = view;
  const winner = view.seats.find((seat) => seat.id === tally.winner);
  const sideNames = (side: number) =>
    view.seats
      .filter((seat) => seat.side === side)
      .map((seat) => seatName(seat, players, t))
      .join(' & ');
  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="okey-tally" data-kind={tally.kind}>
      <div className="flex items-baseline gap-6">
        <p className="font-display text-[56px] font-extrabold">
          {winner ? t('tallyWon', { name: seatName(winner, players, t) }) : t('tallyDraw')}
        </p>
        {tally.kind !== 'normal' && tally.kind !== 'draw' && (
          <p className="text-accent text-[36px] font-bold">{t(`kind.${tally.kind}`)}</p>
        )}
      </div>
      {tally.groups && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4" data-testid="okey-groups">
          {tally.groups.map((group, index) => (
            <div key={index} className="flex gap-1">
              {group.map((id) => (
                <TileFace key={id} id={id} size="md" wild={isOkey(id, view.okey)} />
              ))}
            </div>
          ))}
          {tally.tile !== null && (
            <div className="flex items-center gap-3 pl-6">
              <span className="text-muted text-[24px]">{t('finishTile')}</span>
              <TileFace id={tally.tile} size="md" wild={isOkey(tally.tile, view.okey)} />
            </div>
          )}
        </div>
      )}
      <table className="text-[30px]">
        <tbody>
          {view.sides.map((side, index) => (
            <tr key={index} data-testid="okey-tally-side">
              <td className="py-1 pr-10 font-bold">{sideNames(index)}</td>
              <td className="text-danger pr-10 tabular-nums">
                {(tally.lost[index] ?? 0) > 0 ? `−${tally.lost[index] ?? 0}` : '—'}
              </td>
              <td className="tabular-nums">{t('points', { points: side.points })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OkeyHost(props: Props) {
  const { view, phase, serverNow, players, Avatar, t, sendHostInput } = props;
  return (
    <div
      className="flex h-full flex-col gap-6 overflow-hidden"
      data-testid="okey-host"
      data-phase={view.phase}
    >
      <div className="flex items-start justify-between gap-8">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[56px] leading-tight font-extrabold">{t('name')}</h2>
          <p className="text-muted text-[30px]">
            {view.title}
            {(view.phase === 'TURN' || view.phase === 'TALLY') &&
              ` · ${t('hand', { hand: view.hand, hands: view.hands })}`}
          </p>
        </div>
        {(view.phase === 'TURN' || view.phase === 'SETUP') && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={120}
            label={t('timeLeft')}
          />
        )}
      </div>

      {view.phase === 'SKIPPED' && (
        <p className="text-warning text-[48px] font-bold" data-testid="okey-skipped">
          {t('notEnoughPlayers', { min: view.minPlayers })}
        </p>
      )}
      {view.phase === 'SETUP' && (
        <Setup view={view} players={players} Avatar={Avatar} t={t} sendHostInput={sendHostInput} />
      )}
      {view.phase === 'TURN' && <TableView {...props} view={view} />}
      {view.phase === 'TALLY' && <Tally {...props} view={view} />}
      {view.phase === 'END' && (
        <div className="flex flex-col gap-4" data-testid="okey-result">
          <p className="text-muted text-[30px]">{t(`endedBy.${view.endedBy}`)}</p>
          <ol className="flex flex-col gap-3">
            {view.ranking.map((row) => (
              <li
                key={row.id}
                data-testid="okey-rank"
                data-place={row.place}
                className="bg-surface flex items-center gap-5 rounded-3xl px-6 py-3"
              >
                <span className="font-display w-[70px] text-[40px] font-extrabold">
                  {t('place', { place: row.place })}
                </span>
                <SeatAvatar seat={row} players={players} Avatar={Avatar} size={56} />
                <span className="flex-1 text-[32px] font-bold">{seatName(row, players, t)}</span>
                <span className="text-muted text-[26px]">{t('wins', { count: row.wins })}</span>
                <span className="text-[32px] font-bold tabular-nums">
                  {t('points', { points: row.points })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
