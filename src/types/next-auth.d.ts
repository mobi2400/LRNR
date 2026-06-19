import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    isOwner: boolean;
    user: DefaultSession['user'] & {
      id: string;
    };
  }

  interface User {
    id: string;
    isOwner: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    isOwner?: boolean;
  }
}
