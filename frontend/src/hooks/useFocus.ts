import { useRef, useEffect, useCallback } from "react"

export function useRestoreFocus() {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const saveFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
  }, [])

  const restoreFocus = useCallback(() => {
    previousFocusRef.current?.focus()
  }, [])

  return { saveFocus, restoreFocus }
}

export function useFocusOnMount(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    ref.current?.focus()
  }, [ref])
}
