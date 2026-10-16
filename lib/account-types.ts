export type Account = {
  id: string
  workspaceId: string
  isLegacyWorkspace: boolean
  displayName: string
  email: string | null
  phone: string | null
}
