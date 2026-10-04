'use client';

import type { PlayerRendererProps, RendererPlayer } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import type { SpyLocation, SpyPlayerView, SpyRole } from './schema.js';

type Props = PlayerRendererProps<SpyPlayerView>;

const placeName = (location: SpyLocation) =>
  `${location.emoji ? `${location.emoji} ` : ''}${location.name}`;

/** The secret card; it can be hidden from a neighbour's eyes. */
function RoleCard({ role, t }: { role: SpyRole; t: Props['t'] }) {
  const [shown, setShown] = useState(true);
  if (!role) {
    return (
      <p className="bg-surface rounded-3xl px-6 py-6 text-center" data-testid="spy-watching">
        {t('watching')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid="spy-role"
        data-spy={role.spy}
        data-location-id={role.spy ? '' : role.location.id}
        data-shown={shown}
        onClick={() => {
          setShown(!shown);
        }}
        className={`font-display min-h-[120px] rounded-3xl px-6 py-6 text-center text-3xl font-extrabold ${
          !shown
            ? 'bg-surface-raised text-muted'
            : role.spy
              ? 'bg-danger text-ink'
              : 'bg-brand text-ink'
        }`}
      >
        {!shown ? t('tapToShow') : role.spy ? t('youAreSpy') : placeName(role.location)}
      </button>
      <p className="text-muted text-center text-sm">
        {shown ? (role.spy ? t('spyHint') : t('townHint')) : t('hiddenHint')}
      </p>
    </div>
  );
}

function PlayerGrid({
  ids,
  byId,
  onPick,
  disabled,
  testId,
  Avatar,
}: {
  ids: readonly string[];
  byId: Map<string, RendererPlayer>;
  onPick: (id: string) => void;
  disabled: boolean;
  testId: string;
  Avatar: Props['Avatar'];
}) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {ids.map((id) => {
        const player = byId.get(id);
        if (!player) return null;
        return (
          <li key={id} className="flex">
            <button
              type="button"
              data-testid={testId}
              data-player-id={id}
              disabled={disabled}
              onClick={() => {
                onPick(id);
              }}
              className="bg-surface flex min-h-[96px] flex-1 flex-col items-center justify-center gap-2 rounded-3xl px-2 py-3 transition-transform active:scale-95 disabled:opacity-40"
            >
              <Avatar avatar={player.avatar} color={player.color} size={48} />
              <span className="max-w-full truncate font-semibold">{player.nickname}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The spy names the place: pick from the list, then confirm (one try, it ends the round). */
function GuessPanel({
  locations,
  send,
  busy,
  t,
}: {
  locations: readonly SpyLocation[];
  send: (locationId: string) => void;
  busy: boolean;
  t: Props['t'];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SpyLocation | null>(null);
  if (!open) {
    return (
      <button
        type="button"
        data-testid="spy-guess-open"
        onClick={() => {
          setOpen(true);
        }}
        className="border-danger text-danger min-h-touch rounded-3xl border-2 px-6 py-3 font-bold"
      >
        {t('guessPlace')}
      </button>
    );
  }
  if (picked) {
    return (
      <div className="bg-surface flex flex-col gap-3 rounded-3xl p-4">
        <p className="text-center font-bold">
          {t('guessConfirm', { location: placeName(picked) })}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="border-line min-h-touch rounded-2xl border"
            onClick={() => {
              setPicked(null);
            }}
          >
            {t('back')}
          </button>
          <button
            type="button"
            data-testid="spy-guess-confirm"
            disabled={busy}
            className="bg-danger text-ink min-h-touch rounded-2xl font-bold disabled:opacity-40"
            onClick={() => {
              send(picked.id);
            }}
          >
            {t('guessSend')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted text-sm">{t('guessPick')}</p>
      <ul className="grid grid-cols-2 gap-2">
        {locations.map((location) => (
          <li key={location.id} className="flex">
            <button
              type="button"
              data-testid="spy-guess-option"
              data-location-id={location.id}
              className="bg-surface flex-1 rounded-2xl px-3 py-3 text-left"
              onClick={() => {
                setPicked(location);
              }}
            >
              {placeName(location)}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-muted self-center py-2 text-sm underline"
        onClick={() => {
          setOpen(false);
        }}
      >
        {t('back')}
      </button>
    </div>
  );
}

/** Phone of a "Casus Kim?" player: the role card, the turn, the vote and the spy's guess. */
export function SpyPlayer({
  view,
  players,
  playerId,
  submit,
  haptic,
  describeError,
  t,
  Avatar,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(players.map((player) => [player.id, player]));
  const connected = new Set(players.filter((player) => player.connected).map((p) => p.id));

  const send = async (input: unknown) => {
    if (busy) return;
    haptic();
    setBusy(true);
    setError(null);
    const outcome = await submit(input);
    setBusy(false);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-muted flex-1 text-center" data-testid="spy-player-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  if (view.phase === 'REVEAL') {
    return (
      <div
        className="flex flex-1 flex-col gap-4"
        data-testid="spy-player-reveal"
        data-won={String(view.won)}
        data-outcome={view.outcome}
      >
        <p
          className={`font-display rounded-3xl px-6 py-8 text-center text-3xl font-extrabold ${
            view.won === null
              ? 'bg-surface-raised'
              : view.won
                ? 'bg-success text-canvas'
                : 'bg-surface-raised'
          }`}
        >
          {view.won === null ? t(`outcome.${view.outcome}`) : view.won ? t('youWon') : t('youLost')}
        </p>
        <p className="text-center text-lg">
          {t('locationWas', { location: placeName(view.location) })}
        </p>
        <p className="text-muted text-center">
          {t('spiesAre', {
            names: view.spies.map((id) => byId.get(id)?.nickname ?? '?').join(', '),
          })}
        </p>
      </div>
    );
  }

  const isSpy = view.role?.spy === true;
  const errorBox = error && (
    <p
      role="alert"
      data-testid="spy-error"
      className="bg-danger/15 text-danger rounded-xl px-4 py-3"
    >
      {error}
    </p>
  );

  if (view.phase === 'INTRO') {
    return (
      <div className="flex flex-1 flex-col gap-4" data-testid="spy-player" data-phase="INTRO">
        <RoleCard role={view.role} t={t} />
        <p className="text-muted text-center">{t('spyCount', { count: view.spyCount })}</p>
      </div>
    );
  }

  if (view.phase === 'VOTE') {
    return (
      <div className="flex flex-1 flex-col gap-4" data-testid="spy-player" data-phase="VOTE">
        <RoleCard role={view.role} t={t} />
        {view.role === null ? null : view.votedFor ? (
          <p className="font-display text-center text-2xl font-bold" data-testid="spy-vote-locked">
            {t('voteLocked', { name: byId.get(view.votedFor)?.nickname ?? '?' })}
          </p>
        ) : (
          <>
            <p className="font-display text-xl font-bold">{t('whoIsSpy')}</p>
            <PlayerGrid
              ids={view.roster.filter((id) => id !== playerId)}
              byId={byId}
              disabled={busy}
              testId="spy-vote-candidate"
              Avatar={Avatar}
              onPick={(id) => void send({ type: 'vote', playerId: id })}
            />
          </>
        )}
        {isSpy && (
          <GuessPanel
            locations={view.locations}
            busy={busy}
            t={t}
            send={(locationId) => void send({ type: 'guess', locationId })}
          />
        )}
        {errorBox}
      </div>
    );
  }

  // DISCUSS
  const myTurn = view.asker === playerId || (view.role !== null && !connected.has(view.asker));
  const targets = view.roster.filter(
    (id) =>
      id !== playerId && connected.has(id) && !(view.asker === playerId && id === view.askedBy),
  );
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="spy-player" data-phase="DISCUSS">
      <RoleCard role={view.role} t={t} />
      {view.role !== null && myTurn ? (
        <div className="flex flex-col gap-3" data-testid="spy-my-turn">
          <p className="font-display text-xl font-bold">{t('yourTurn')}</p>
          <PlayerGrid
            ids={targets}
            byId={byId}
            disabled={busy}
            testId="spy-ask-target"
            Avatar={Avatar}
            onPick={(id) => void send({ type: 'ask', playerId: id })}
          />
        </div>
      ) : (
        <p className="bg-surface rounded-2xl px-4 py-4 text-center text-lg" data-testid="spy-turn">
          {t('isAsking', { name: byId.get(view.asker)?.nickname ?? '?' })}
        </p>
      )}
      {view.role !== null && (
        <button
          type="button"
          data-testid="spy-request-vote"
          aria-pressed={view.requestedVote}
          disabled={busy}
          onClick={() => void send({ type: 'requestVote', value: !view.requestedVote })}
          className={`min-h-touch rounded-3xl px-6 py-3 font-bold ${
            view.requestedVote ? 'bg-warning text-canvas' : 'border-line border'
          }`}
        >
          {view.requestedVote
            ? t('voteRequested', { count: view.voteRequests, needed: view.votesNeeded })
            : t('requestVote', { count: view.voteRequests, needed: view.votesNeeded })}
        </button>
      )}
      {isSpy && (
        <GuessPanel
          locations={view.locations}
          busy={busy}
          t={t}
          send={(locationId) => void send({ type: 'guess', locationId })}
        />
      )}
      {!isSpy && view.role !== null && (
        <details className="text-muted text-sm">
          <summary>{t('allPlaces')}</summary>
          <p className="mt-2">{view.locations.map(placeName).join(' · ')}</p>
        </details>
      )}
      {errorBox}
    </div>
  );
}
