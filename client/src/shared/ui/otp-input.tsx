import * as React from "react"
import { cn } from "@/shared/lib/utils"

export interface OtpInputProps {
  length: number
  value: string
  onChange: (value: string) => void
  type?: "numeric" | "alphanumeric"
  disabled?: boolean
  autoFocus?: boolean
  onComplete?: (value: string) => void
}

// Segmented one-time-code input with one box per character plus auto-advance and full-code paste
export function OtpInput({
  length, value, onChange, type = "numeric", disabled, autoFocus, onComplete,
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([])
  const chars = React.useMemo(() => {
    const arr = value.split("").slice(0, length)
    while (arr.length < length) arr.push("")
    return arr
  }, [value, length])

  const sanitize = (s: string) =>
    (type === "numeric" ? s.replace(/\D/g, "") : s.replace(/\s/g, ""))

  // Fire onComplete only on the transition to complete since editing a full code would otherwise re-submit
  const wasComplete = React.useRef(false)
  React.useEffect(() => {
    const complete = value.length === length
    if (complete && !wasComplete.current) onComplete?.(value)
    wasComplete.current = complete
    // onComplete is intentionally excluded because callers pass inline closures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length])

  const setAt = (index: number, char: string) => {
    const next = chars.slice()
    next[index] = char
    onChange(next.join(""))
  }

  const distributeFrom = (index: number, raw: string) => {
    const cleaned = sanitize(raw)
    if (!cleaned) return
    const next = chars.slice()
    let i = index
    for (const c of cleaned.split("")) {
      if (i >= length) break
      next[i] = c
      i += 1
    }
    onChange(next.join(""))
    refs.current[Math.min(i, length - 1)]?.focus()
  }

  const handleChange = (index: number, raw: string) => {
    const cleaned = sanitize(raw)
    if (!cleaned) { setAt(index, ""); return }
    distributeFrom(index, cleaned)
  }

  // maxLength={1} truncates pastes in real browsers so handle paste explicitly to fill every box
  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text")
    if (!text) return
    e.preventDefault()
    distributeFrom(index, text)
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (chars[index]) { setAt(index, ""); return }
      if (index > 0) { refs.current[index - 1]?.focus(); setAt(index - 1, "") }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus()
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el }}
          value={char}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          inputMode={type === "numeric" ? "numeric" : "text"}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
          className={cn(
            "size-10 rounded-lg border border-input bg-transparent text-center text-lg font-medium outline-none transition-colors",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
          )}
        />
      ))}
    </div>
  )
}
