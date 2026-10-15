import { LoginForm } from '@/components/login-form'
import { isAuthEnabled } from '@/lib/server/auth'
import { redirect } from 'next/navigation'

export default function LoginPage() {
  if (!isAuthEnabled()) redirect('/')
  return <LoginForm />
}
