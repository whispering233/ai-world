import type { ReactNode } from 'react'

export interface DataTableProps {
  columns: string[]
  rows: ReactNode[][]
  className?: string
}

export function DataTable({ columns, rows, className = '' }: DataTableProps) {
  return (
    <table className={`w-full border-collapse text-left text-body ${className}`}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col" className="border-b border-rule py-1 pr-4 text-meta font-normal text-ink-soft">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="border-b border-rule py-1 pr-4">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
