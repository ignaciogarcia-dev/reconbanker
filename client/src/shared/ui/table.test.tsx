import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'

describe('Table', () => {
  it('renders a full table tree with appropriate data-slot attributes', () => {
    render(
      <Table data-testid="table" className="c-tbl">
        <TableCaption data-testid="cap" className="c-cap">
          Cap
        </TableCaption>
        <TableHeader data-testid="thead" className="c-thead">
          <TableRow data-testid="hr" className="c-hr">
            <TableHead data-testid="th" className="c-th">
              H
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-testid="tbody" className="c-tbody">
          <TableRow data-testid="br">
            <TableCell data-testid="td" className="c-td">
              Cell
            </TableCell>
          </TableRow>
        </TableBody>
        <TableFooter data-testid="tfoot" className="c-tfoot">
          <TableRow>
            <TableCell>F</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    )

    const table = screen.getByTestId('table')
    expect(table.tagName).toBe('TABLE')
    expect(table).toHaveAttribute('data-slot', 'table')
    expect(table.className).toContain('c-tbl')
    // wrapping div has data-slot=table-container
    expect(table.parentElement).toHaveAttribute('data-slot', 'table-container')

    expect(screen.getByTestId('thead')).toHaveAttribute(
      'data-slot',
      'table-header'
    )
    expect(screen.getByTestId('tbody')).toHaveAttribute(
      'data-slot',
      'table-body'
    )
    expect(screen.getByTestId('tfoot')).toHaveAttribute(
      'data-slot',
      'table-footer'
    )
    expect(screen.getByTestId('hr')).toHaveAttribute('data-slot', 'table-row')
    expect(screen.getByTestId('th')).toHaveAttribute('data-slot', 'table-head')
    expect(screen.getByTestId('td')).toHaveAttribute('data-slot', 'table-cell')
    expect(screen.getByTestId('cap')).toHaveAttribute(
      'data-slot',
      'table-caption'
    )

    // className composition
    expect(screen.getByTestId('thead').className).toContain('c-thead')
    expect(screen.getByTestId('tbody').className).toContain('c-tbody')
    expect(screen.getByTestId('tfoot').className).toContain('c-tfoot')
    expect(screen.getByTestId('hr').className).toContain('c-hr')
    expect(screen.getByTestId('th').className).toContain('c-th')
    expect(screen.getByTestId('td').className).toContain('c-td')
    expect(screen.getByTestId('cap').className).toContain('c-cap')
  })
})
