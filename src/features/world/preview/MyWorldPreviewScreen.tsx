import MyWorld from '@/features/world/components/MyWorld'
import { useMyWorld } from '@/features/world/data/useMyWorld'
import { useWorldPath } from '@/features/world/useWorldPath'
import AppShell from '@/layouts/AppShell'

/**
 * DEV PREVIEW ONLY — /preview/my-world?at=jp|jp/sado
 *
 * The same My World as home, outside the auth guard, so the drawn map can be
 * looked at without an account. Places, names and sheets come from `places`.
 * The coastlines stay the drawings in the atlas. Registered only in
 * development builds.
 */
export default function MyWorldPreviewScreen() {
  const { path, enter, back } = useWorldPath()
  const { snapshot, discovery, ready } = useMyWorld()

  return (
    <AppShell>
      {ready && (
        <MyWorld snapshot={snapshot} discovery={discovery} path={path} onEnter={enter} onBack={back} />
      )}
    </AppShell>
  )
}
