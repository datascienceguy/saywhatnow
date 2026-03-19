import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
})

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|default-avatar.svg|pictures|clips|login).*)',
  ],
}
