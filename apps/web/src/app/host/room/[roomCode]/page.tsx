import { roomCodeSchema } from '@loudroom/shared';
import { notFound } from 'next/navigation';
import { HostLobby } from './host-lobby';

export default async function HostRoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  if (!roomCodeSchema.safeParse(roomCode).success) notFound();
  return <HostLobby roomCode={roomCode} />;
}
