import { useParams } from 'react-router'
import { AppShell } from '../components/AppShell.tsx'

export default function EditorPage() {
  const { projectId } = useParams()
  return (
    <AppShell>
      <div className="p-8 text-slate-500">Editor del proyecto {projectId} (fase 4).</div>
    </AppShell>
  )
}
