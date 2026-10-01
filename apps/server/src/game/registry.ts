import type { AnyGameModule } from '@loudroom/game-sdk';
import { quizModule } from '@loudroom/game-quiz/server';

/** Every playable game. Adding a game = its package + one line here (SPEC §5). */
const MODULES: readonly AnyGameModule[] = [quizModule];

const byType = new Map(MODULES.map((module) => [module.id, module]));

export function findGameModule(gameType: string): AnyGameModule | undefined {
  return byType.get(gameType);
}
