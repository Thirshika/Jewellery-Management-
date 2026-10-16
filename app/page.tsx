import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppDashboard } from '@/components/app-dashboard'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const cookieStore = await cookies()
  if (!verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)) redirect('/login')
  return <AppDashboard />
}
