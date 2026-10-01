import { Brand } from '@/components/brand';
import { ConnectionStatus } from '@/components/connection-status';

export default function PlayHomePage() {
  return (
    <main className="flex flex-1 flex-col gap-6">
      <header className="flex items-center justify-between">
        <span className="text-2xl">
          <Brand />
        </span>
        <ConnectionStatus variant="compact" />
      </header>
    </main>
  );
}
