import { useState } from 'react'
import { Modal } from './ConfirmDialog.tsx'

export interface NewProjectValues {
  name: string
  description: string
}

/** Crea un proyecto vacío: nace con un primer step «Inicio» listo para escribir DBML. */
export function NewProjectDialog(props: {
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: NewProjectValues) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  return (
    <Modal onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) props.onSubmit({ name: name.trim(), description: description.trim() })
        }}
      >
        <h2 className="text-base font-semibold text-slate-900">Nuevo proyecto</h2>
        <p className="mt-1 text-sm text-slate-500">
          Empieza vacío, con un primer step llamado <b className="font-semibold text-slate-700">Inicio</b>.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="project-name">Nombre</label>
            <input
              id="project-name"
              data-autofocus
              className="input"
              maxLength={120}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sistema de inventario"
            />
          </div>
          <div>
            <label className="label" htmlFor="project-desc">Descripción (opcional)</label>
            <textarea
              id="project-desc"
              className="input min-h-20 resize-y"
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Qué modela este proyecto"
            />
          </div>
        </div>
        {props.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{props.error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={props.busy || !name.trim()}>
            {props.busy ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
