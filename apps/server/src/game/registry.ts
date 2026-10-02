import type { AnyGameModule } from '@loudroom/game-sdk';
import { bluffModule } from '@loudroom/game-bluff/server';
import { closestNumberModule } from '@loudroom/game-closest-number/server';
import { drawingModule } from '@loudroom/game-drawing/server';
import { imageLocationModule } from '@loudroom/game-image-location/server';
import { quizModule } from '@loudroom/game-quiz/server';
import { sortingModule } from '@loudroom/game-sorting/server';
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
];

const byType = new Map(MODULES.map((module) => [module.id, module]));

export function findGameModule(gameType: string): AnyGameModule | undefined {
  return byType.get(gameType);
}
