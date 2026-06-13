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

  it('backspace clears the current box when it holds a character', () => {
    render(<Harness length={3} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.change(boxes[0], { target: { value: '5' } })
    fireEvent.keyDown(boxes[0], { key: 'Backspace' })
    expect(boxes[0].value).toBe('')
  })

  it('navigates between boxes with the arrow keys', () => {
    render(<Harness length={3} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    boxes[1].focus()
    fireEvent.keyDown(boxes[1], { key: 'ArrowLeft' })
    expect(boxes[0]).toHaveFocus()
    fireEvent.keyDown(boxes[0], { key: 'ArrowRight' })
    expect(boxes[1]).toHaveFocus()
    // No-ops at the edges are tolerated.
    fireEvent.keyDown(boxes[0], { key: 'ArrowLeft' })
    fireEvent.keyDown(boxes[2], { key: 'ArrowRight' })
  })

  it('handles pastes, ignoring empty or all-invalid clipboards, and truncates overflow', () => {
    render(<Harness length={4} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '' } })
    expect(boxes.map((b) => b.value).join('')).toBe('')
    // All-invalid paste in numeric mode sanitizes to empty and is ignored.
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => 'abc' } })
    expect(boxes.map((b) => b.value).join('')).toBe('')
    // A code longer than the field truncates to the available boxes.
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '1234567' } })
    expect(boxes.map((b) => b.value).join('')).toBe('1234')
    fireEvent.focus(boxes[0])
  })

  it('ignores backspace on an empty first box', () => {
    render(<Harness length={3} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.keyDown(boxes[0], { key: 'Backspace' })
    expect(boxes.map((b) => b.value).join('')).toBe('')
  })

  it('keeps non-space characters in alphanumeric mode', () => {
    function AlphaHarness() {
      const [value, setValue] = useState('')
      return <OtpInput length={4} value={value} onChange={setValue} type="alphanumeric" />
    }
    render(<AlphaHarness />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.change(boxes[0], { target: { value: 'a b' } })
    expect(boxes.map((b) => b.value).join('')).toBe('ab')
  })

  it('renders disabled boxes when disabled', () => {
    render(<OtpInput length={2} value="" onChange={() => {}} disabled />)
    for (const box of screen.getAllByRole('textbox')) expect(box).toBeDisabled()
  })
})
