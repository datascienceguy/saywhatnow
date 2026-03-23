import NextAuth from 'next-auth'
import { authConfig } from './auth.config'
import { prisma } from '@/lib/prisma'

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    signIn({ profile }) {
      const allowed = process.env.AUTH_ALLOWED_EMAILS
      if (!allowed) return true
      const emails = allowed.split(',').map(e => e.trim().toLowerCase())
      return emails.includes((profile?.email ?? '').toLowerCase())
    },
    async jwt({ token, user }) {
      // On first sign-in, user object is present — look up role from DB
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { role: true },
        })
        token.role = dbUser?.role ?? 'GUEST'
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined
      }
      return session
    },
  },
})
