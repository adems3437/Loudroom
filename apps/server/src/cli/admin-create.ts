/**
 * Creates the first admin account, or resets an admin's password (SPEC §9: no default
 * credentials in production).
 *
 *   pnpm admin:create --email ada@example.com --name "Ada"
 *   pnpm admin:create --email ada@example.com --reset
 *
 * In production it runs from the built server image (docs/DEPLOY.md):
 *
 *   docker compose … run --rm server node dist/cli/admin-create.js --email ada@example.com
 *
 * The password is asked for twice without echo; ADMIN_PASSWORD supplies it non-interactively.
 */
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import {
  displayNameSchema,
  emailSchema,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
} from '@loudroom/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../admin/password.js';
import { PrismaClient } from '../generated/prisma/client.js';

try {
  process.loadEnvFile(new URL('../../../../.env', import.meta.url));
} catch {
  // no .env file — rely on the process environment
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide what is typed: only the prompt itself is written.
  const write = rl as unknown as { _writeToOutput: (text: string) => void };
  write._writeToOutput = (text: string) => {
    if (text.includes(question)) process.stdout.write(text);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function checkedPassword(value: string): string {
  const parsed = passwordSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`The password must be ${PASSWORD_MIN_LENGTH}–128 characters`);
  return parsed.data;
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return checkedPassword(fromEnv);
  if (!process.stdin.isTTY) throw new Error('No terminal: set ADMIN_PASSWORD instead');
  const first = checkedPassword(
    await ask(`Password (at least ${PASSWORD_MIN_LENGTH} characters): `),
  );
  if ((await ask('Repeat password: ')) !== first) throw new Error('The passwords do not match');
  return first;
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    reset: { type: 'boolean', default: false },
  },
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
const email = emailSchema.safeParse(values.email ?? '').data;
if (!email) {
  console.error('Usage: pnpm admin:create --email you@example.com [--name "Your Name"] [--reset]');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (values.reset) {
    if (!existing) throw new Error(`No account for ${email}`);
    await prisma.user.update({
      where: { email },
      data: { passwordHash: await hashPassword(await readPassword()), role: 'ADMIN' },
    });
    console.log(`Password reset; ${email} is an admin.`);
  } else {
    if (existing) throw new Error(`${email} already exists (use --reset to set a new password)`);
    const displayName = displayNameSchema.parse(values.name ?? email.split('@')[0]);
    await prisma.user.create({
      data: {
        email,
        displayName,
        role: 'ADMIN',
        passwordHash: await hashPassword(await readPassword()),
      },
    });
    console.log(`Admin ${email} created.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
