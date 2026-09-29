import { useState, type FormEvent } from 'react'
import type { StepDto } from '../../core/api.ts'
import { STEP_PALETTE } from '../../core/palette.ts'
import type { StepStatus } from '../../core/types.ts'
import { Modal } from '../../components/ConfirmDialog.tsx'

export interface StepFormValues {
  name: string
  workDate: string
  color: string
  status: StepStatus
  description: string
}

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function StepDialog(props: {
  step?: StepDto
  defaultColor: string
  busy?: boolean
  error?: string | null
  onSubmit: (values: StepFormValues) => void
  onClose: () => void
}) {
  const { step } = props
  const [values, setValues] = useState<StepFormValues>({
    name: step?.name ?? '',
    workDate: step?.workDate ?? todayIso(),
    color: step?.color ?? props.defaultColor,
    status: step?.status ?? 'en_curso',
    description: step?.description ?? '',
  })
  const set = <K extends keyof StepFormValues>(k: K, v: StepFormValues[K]) => setValues((prev) => ({ ...prev, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (values.name.trim()) props.onSubmit({ ...values, name: values.name.trim(), description: values.description.trim() })
  }

  return (
    <Modal onClose={props.onClose}>
      <form onSubmit={submit}>
        <div className="mb-4 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full transition-colors" style={{ background: values.color }} />
          <h2 className="text-base font-semibold text-slate-900">{step ? `Editar step ${step.slug}` : 'Nuevo step'}</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="step-name">Nombre</label>
            <input
              id="step-name"
              className="input"
              data-autofocus
              required
              maxLength={120}
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Facturación electrónica"
            />
            {!step && <p className="mt-1 text-xs text-slate-400">El slug se genera como NN-nombre y no cambia después.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="step-date">Fecha</label>
              <input id="step-date" type="date" className="input" value={values.workDate} onChange={(e) => set('workDate', e.target.value)} required />
            </div>
            {step && (
              <div>
                <label className="label" htmlFor="step-status">Estado</label>
                <select id="step-status" className="input" value={values.status} onChange={(e) => set('status', e.target.value as StepStatus)}>
                  <option value="en_curso">En curso</option>
                  <option value="completado">Completado</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <span className="label">Color</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {STEP_PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-label={`Color ${c}`}
                  onClick={() => set('color', c)}
                  className={`h-6 w-6 rounded-full transition hover:scale-110 ${values.color.toUpperCase() === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                aria-label="Color personalizado"
                className="h-6 w-8 cursor-pointer rounded border border-slate-200 bg-white"
                value={values.color}
                onChange={(e) => set('color', e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="step-desc">Descripción</label>
            <textarea
              id="step-desc"
              className="input min-h-20 resize-y"
              maxLength={2000}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Qué se modela en este step y por qué"
            />
          </div>
        </div>
        {props.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{props.error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={props.busy || !values.name.trim()}>
            {step ? 'Guardar' : 'Crear step'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
