import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

// Edge-compatible config — no Prisma, no Node.js-only modules.
// Used by middleware. Role comes from the JWT token (stored at sign-in time).
export const authConfig: NextAuthConfig = {
  providers: [Google],
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token }) {
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined
      }
      return session
    },
  },
}
