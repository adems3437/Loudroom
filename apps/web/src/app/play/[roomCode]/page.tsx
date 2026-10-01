import { roomCodeSchema } from '@loudroom/shared';
import { notFound } from 'next/navigation';
import { PlayerRoom } from './player-room';

export default async function PlayerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;
  if (!roomCodeSchema.safeParse(roomCode).success) notFound();
  return <PlayerRoom roomCode={roomCode} />;
}
