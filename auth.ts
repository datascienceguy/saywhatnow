import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    signIn({ profile }) {
      const allowed = process.env.AUTH_ALLOWED_EMAILS
      if (!allowed) return true // allow any Google account
      const emails = allowed.split(',').map(e => e.trim().toLowerCase())
      return emails.includes((profile?.email ?? '').toLowerCase())
    },
  },
})
