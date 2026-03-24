import NextAuth from 'next-auth'
import { authConfig } from './auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (internalSecret && req.headers.get('x-internal-secret') === internalSecret) {
    return NextResponse.next()
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (req.nextUrl.pathname.startsWith('/admin')) {
    const role = (req.auth.user as { role?: string })?.role
    if (role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }
})

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|default-avatar.svg|pictures|clips|login).*)',
  ],
}
