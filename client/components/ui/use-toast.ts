import { useState } from "react"

export interface Toast {
    id: string
    title?: string
    description?: string
    action?: React.ReactNode
    variant?: "default" | "destructive"
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])

    const toast = ({ title, description, variant }: Omit<Toast, "id">) => {
        const id = Math.random().toString(36).substr(2, 9)
        const newToast = { id, title, description, variant }
        setToasts((prev) => [...prev, newToast])

        // Auto dismiss
        setTimeout(() => {
            dismiss(id)
        }, 3000)

        return { ...newToast }
    }

    const dismiss = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }

    return {
        toast,
        dismiss,
        toasts,
    }
}
