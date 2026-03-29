import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import UsersManager from './UsersManager'

export default async function UsersPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') redirect('/admin')

  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const currentEmail = session?.user?.email ?? ''

  return <UsersManager users={users} currentEmail={currentEmail} />
}
