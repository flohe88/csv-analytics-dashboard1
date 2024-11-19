import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from '@tanstack/react-table'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { BookingData } from '../../types/booking'

interface DataTableProps {
  data: BookingData[]
}

export function DataTable({ data }: DataTableProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'bookingDate', desc: true } // Standardmäßig nach Buchungsdatum absteigend sortieren
  ])
  const [cancellationStatus, setCancellationStatus] = useState<'all' | boolean>('all')

  const filteredData = useMemo(() => {
    if (cancellationStatus === 'all') return data;
    return data.filter(booking => booking.cancelled === cancellationStatus);
  }, [data, cancellationStatus]);

  const columns = useMemo<ColumnDef<BookingData>[]>(
    () => [
      {
        accessorKey: 'bookingCode',
        header: 'Buchungscode',
      },
      {
        accessorKey: 'bookingDate',
        header: 'Buchungsdatum',
        cell: (info) => format(new Date(info.getValue() as string), 'dd.MM.yyyy', { locale: de }),
        sortingFn: 'datetime', // Spezielle Sortierung für Datumswerte
      },
      {
        accessorKey: 'arrivalDate',
        header: 'Anreise',
        cell: (info) => format(new Date(info.getValue() as string), 'dd.MM.yyyy', { locale: de }),
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'departureDate',
        header: 'Abreise',
        cell: (info) => format(new Date(info.getValue() as string), 'dd.MM.yyyy', { locale: de }),
        sortingFn: 'datetime',
      },
      {
        // Spalte für die Objektnummer (SpID)
        accessorKey: 'spId',
        header: 'Objektnummer',
        cell: (info) => info.getValue() || '-',
      },
      {
        accessorKey: 'serviceCity',
        header: 'Stadt',
      },
      {
        accessorKey: 'serviceName',
        header: 'Unterkunft',
      },
      {
        accessorKey: 'region',
        header: 'Region',
      },
      {
        accessorKey: 'totalPrice',
        header: 'Gesamtpreis',
        cell: (info) =>
          new Intl.NumberFormat('de-DE', {
            style: 'currency',
            currency: 'EUR',
          }).format(info.getValue() as number),
        sortingFn: 'number',
      },
      {
        accessorKey: 'adults',
        header: 'Erwachsene',
        sortingFn: 'number',
      },
      {
        accessorKey: 'children',
        header: 'Kinder',
        sortingFn: 'number',
      },
      {
        accessorKey: 'persons',
        header: 'Personen',
        sortingFn: 'number',
      },
      {
        accessorKey: 'country',
        header: 'Land',
      },
      {
        accessorKey: 'postalCode',
        header: 'PLZ',
      },
      {
        accessorKey: 'city',
        header: 'Stadt (Kunde)',
      },
      {
        accessorKey: 'serviceCountry',
        header: 'Land (Service)',
      },
      {
        accessorKey: 'cancelled',
        header: 'Storniert',
        cell: (info) => (info.getValue() ? 'Ja' : 'Nein'),
      },
      {
        accessorKey: 'cancellationDate',
        header: 'Stornierungsdatum',
        cell: (info) => {
          const value = info.getValue() as string
          return value ? format(new Date(value), 'dd.MM.yyyy', { locale: de }) : '-'
        },
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'commission',
        header: 'Provision',
        cell: (info) =>
          new Intl.NumberFormat('de-DE', {
            style: 'currency',
            currency: 'EUR',
          }).format(info.getValue() as number),
        sortingFn: 'number',
      },
    ],
    []
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="p-4 flex gap-4 items-center">
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Suchen..."
          className="flex-1 p-2 border rounded"
        />
        <select
          value={cancellationStatus === 'all' ? 'all' : cancellationStatus.toString()}
          onChange={(e) => {
            const value = e.target.value;
            setCancellationStatus(value === 'all' ? 'all' : value === 'true')
          }}
          className="p-2 border rounded bg-white"
        >
          <option value="all">Alle Buchungen</option>
          <option value="true">Stornierte Buchungen</option>
          <option value="false">Nicht stornierte Buchungen</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none ${
                      header.column.getCanSort() ? 'hover:text-gray-700' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      <span className="text-gray-400">
                        {{
                          asc: '↑',
                          desc: '↓',
                        }[header.column.getIsSorted() as string] ?? ''}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
