import { Brand } from '@/components/brand';
import { ConnectionStatus } from '@/components/connection-status';

export default function HostHomePage() {
  return (
    <div className="flex h-full flex-col justify-between">
      <h1 className="text-[144px] leading-none">
        <Brand />
      </h1>
      <div className="w-[760px] text-[40px]">
        <ConnectionStatus />
      </div>
    </div>
  );
}
