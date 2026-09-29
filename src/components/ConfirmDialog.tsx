import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Diálogo modal sobre `<dialog>` nativo: el fondo queda inerte, el foco se
 * queda dentro y Escape lo cierra. `onClose` vacío = hay que elegir una opción.
 */
export function Modal({
  children,
  onClose,
  dismissible = true,
  wide = false,
}: {
  children: ReactNode
  onClose: () => void
  dismissible?: boolean
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      // El foco inicial lo decide el contenido (`data-autofocus`), no el primer elemento enfocable.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal
      className={`sdb-dialog nokey ${wide ? 'sdb-dialog-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault()
        if (dismissible) onClose()
      }}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="p-5">{children}</div>
    </dialog>
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
        <button className="btn" onClick={props.onCancel} data-autofocus>
          Cancelar
        </button>
        <button className={`btn ${props.danger ? 'btn-danger' : 'btn-primary'}`} onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
