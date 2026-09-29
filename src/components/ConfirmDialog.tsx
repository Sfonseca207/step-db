import type { ReactNode } from 'react'

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div role="dialog" aria-modal className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog(props: {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal onClose={props.onCancel}>
      <h2 className="text-base font-semibold text-slate-900">{props.title}</h2>
      <div className="mt-2 text-sm text-slate-600">{props.message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={props.onCancel} autoFocus>
          Cancelar
        </button>
        <button className={`btn ${props.danger ? 'btn-danger' : 'btn-primary'}`} onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
