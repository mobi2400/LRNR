import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { loginRequestSchema } from '@/schemas/auth.schema';
import { serverConfig } from '@/server/config';
import { isOwnerIdentity, normalizeOwnerValue } from '@/server/owner';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/auth.ts');

function buildOwnerUser(identifier: string) {
  const normalizedIdentifier = normalizeOwnerValue(identifier);
  const configuredEmail = normalizeOwnerValue(serverConfig.owner.email);
  const configuredUserId = serverConfig.owner.userId?.trim() ?? null;
  const matchesEmail =
    normalizedIdentifier !== null && configuredEmail === normalizedIdentifier;
  const matchesUserId =
    configuredUserId !== null && configuredUserId === identifier.trim();

  if (!matchesEmail && !matchesUserId) {
    return null;
  }

  const userId = configuredUserId ?? `owner:${normalizedIdentifier}`;
  const email =
    configuredEmail ??
    (normalizedIdentifier?.includes('@')
      ? normalizedIdentifier
      : `${normalizedIdentifier}@lrnr.local`);

  return {
    id: userId,
    email,
    name: 'LRNR Owner',
    isOwner: true,
  };
}

export const { handlers, auth, signIn } = NextAuth({
  trustHost: true,
  secret: serverConfig.auth.secret,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'LRNR Owner',
      credentials: {
        identifier: {
          label: 'Owner Email or User ID',
          type: 'text',
        },
      },
      authorize(rawCredentials) {
        const parsedCredentials = loginRequestSchema.safeParse(rawCredentials);

        if (!parsedCredentials.success) {
          return null;
        }

        return buildOwnerUser(parsedCredentials.data.identifier);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.email = user.email ?? null;
        token.name = user.name ?? null;
        token.isOwner = isOwnerIdentity({
          userId: user.id,
          email: user.email ?? null,
        });
      }

      return token;
    },
    session({ session, token }) {
      session.user = {
        ...session.user,
        id: typeof token.userId === 'string' ? token.userId : '',
        email:
          typeof token.email === 'string'
            ? token.email
            : session.user?.email ?? null,
        name:
          typeof token.name === 'string'
            ? token.name
            : session.user?.name ?? null,
      };
      session.isOwner = token.isOwner === true;

      return session;
    },
  },
});
