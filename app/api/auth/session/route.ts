import { SESSION_COOKIE, getSessionAccountId, getSessionWorkspaceId } from '@/lib/server/auth'
import { getAccountById } from '@/lib/server/accounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = request.headers.get('cookie')?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  const accountId = getSessionAccountId(token)
  const workspaceId = getSessionWorkspaceId(token)
  if (!accountId || !workspaceId) {
    return Response.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const account = await getAccountById(accountId)
    return Response.json(
      {
        authenticated: Boolean(account && account.workspaceId === workspaceId),
        identifier: account?.email ?? account?.phone ?? null,
        displayName: account?.displayName ?? null,
        workspaceId: account?.workspaceId === workspaceId ? workspaceId : null,
        isLegacyWorkspace: account?.isLegacyWorkspace ?? false,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Could not load the signed-in account:', error)
    return Response.json({ error: 'Account information is temporarily unavailable.' }, { status: 500 })
  }
}
