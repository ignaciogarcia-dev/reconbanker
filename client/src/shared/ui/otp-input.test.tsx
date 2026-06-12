import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { OtpInput } from './otp-input'

function Harness({ length = 6, onComplete }: { length?: number; onComplete?: (v: string) => void }) {
  const [value, setValue] = useState('')
  return <OtpInput length={length} value={value} onChange={setValue} onComplete={onComplete} />
}

describe('OtpInput', () => {
  it('renders one box per digit', () => {
    render(<Harness length={6} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(6)
  })

  it('filters non-numeric input by default and advances focus', () => {
    render(<Harness length={4} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.change(boxes[0], { target: { value: 'a' } })
    expect(boxes[0].value).toBe('')
    fireEvent.change(boxes[0], { target: { value: '7' } })
    expect(boxes[0].value).toBe('7')
  })

  it('distributes a pasted full code across boxes and fires onComplete', () => {
    const onComplete = vi.fn()
    render(<Harness length={4} onComplete={onComplete} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.change(boxes[0], { target: { value: '1234' } })
    expect(boxes.map((b) => b.value).join('')).toBe('1234')
    expect(onComplete).toHaveBeenCalledWith('1234')
  })

  it('backspace on an empty box moves to and clears the previous one', () => {
    const { container } = render(<Harness length={3} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.change(boxes[0], { target: { value: '5' } })
    fireEvent.keyDown(boxes[1], { key: 'Backspace' })
    expect(boxes[0].value).toBe('')
    expect(container).toBeTruthy()
  })
})
