import { LoginForm } from '@/components/login-form'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/server/auth'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  const cookieStore = await cookies()
  if (verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)) redirect('/')
  return <LoginForm />
}
