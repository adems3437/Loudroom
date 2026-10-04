import type { AnyGameModule } from '@loudroom/game-sdk';
import { amiralModule } from '@loudroom/game-amiral-batti/server';
import { bluffModule } from '@loudroom/game-bluff/server';
import { closestNumberModule } from '@loudroom/game-closest-number/server';
import { drawingModule } from '@loudroom/game-drawing/server';
import { imageLocationModule } from '@loudroom/game-image-location/server';
import { kizmaModule } from '@loudroom/game-kizma-birader/server';
import { memoryModule } from '@loudroom/game-memory/server';
import { pistiModule } from '@loudroom/game-pisti/server';
import { quizModule } from '@loudroom/game-quiz/server';
import { reactionModule } from '@loudroom/game-reaction/server';
import { sortingModule } from '@loudroom/game-sorting/server';
import { spyModule } from '@loudroom/game-spy/server';
import { tombalaModule } from '@loudroom/game-tombala/server';
import { unoModule } from '@loudroom/game-uno/server';
import { whoWouldModule } from '@loudroom/game-who-would/server';

/** Every playable game. Adding a game = its package + one line here (SPEC §5). */
const MODULES: readonly AnyGameModule[] = [
  quizModule,
  closestNumberModule,
  sortingModule,
  whoWouldModule,
  imageLocationModule,
  bluffModule,
  drawingModule,
  reactionModule,
  memoryModule,
  tombalaModule,
  spyModule,
  unoModule,
  pistiModule,
  kizmaModule,
  amiralModule,
];

const byType = new Map(MODULES.map((module) => [module.id, module]));

export function findGameModule(gameType: string): AnyGameModule | undefined {
  return byType.get(gameType);
}
