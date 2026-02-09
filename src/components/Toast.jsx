import { useState, useEffect, useCallback } from 'react'

let toastId = 0
let addToastGlobal = null

export function showToast(message, type = 'info', duration = 4000) {
  if (addToastGlobal) {
    addToastGlobal({ id: ++toastId, message, type, duration })
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((toast) => {
    setToasts(prev => [...prev, toast])
    if (toast.duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id))
      }, toast.duration)
    }
  }, [])

  useEffect(() => {
    addToastGlobal = addToast
    return () => { addToastGlobal = null }
  }, [addToast])

  const dismiss = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`} onClick={() => dismiss(toast.id)}>
          <span className="toast-icon">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : toast.type === 'warning' ? '⚠' : 'ℹ'}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={(e) => { e.stopPropagation(); dismiss(toast.id) }}>×</button>
        </div>
      ))}
    </div>
  )
}

