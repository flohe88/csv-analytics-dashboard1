import React, { useMemo, useState } from 'react';
import { BookingData } from '../../types/booking';
import { formatCurrency, formatPercentage } from '../../utils/formatters';
import { ArrowDownIcon, ArrowUpIcon, ArrowDownTrayIcon } from '@heroicons/react/20/solid';
import { differenceInDays, parse, format, isWithinInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import jsPDF from 'jspdf';

interface TopAccommodationsTableProps {
  data: BookingData[];
  isYearComparison?: boolean;
  comparisonData?: BookingData[];
  startDate: Date;
  endDate: Date;
  comparisonStartDate?: Date;
  comparisonEndDate?: Date;
}

type AccommodationStats = {
  name: string;
  city: string;
  revenue: number;
  bookings: number;
  commission: number;
  nights: number;
  cancelledBookings: number;
  comparisonRevenue?: number;
  comparisonBookings?: number;
  comparisonCommission?: number;
  comparisonNights?: number;
  comparisonCancelledBookings?: number;
  revenueChange?: number;
  bookingsChange?: number;
  commissionChange?: number;
  nightsChange?: number;
  cancellationRateChange?: number;
};

export function TopAccommodationsTable({
  data,
  isYearComparison,
  comparisonData,
  startDate,
  endDate,
  comparisonStartDate,
  comparisonEndDate,
}: TopAccommodationsTableProps) {
  const [selectedCity, setSelectedCity] = React.useState<string>('');
  const [showExportMenu, setShowExportMenu] = React.useState(false);

  const accommodationStats = useMemo(() => {
    // Funktion zum Berechnen der Statistiken für einen Datensatz
    const calculateStats = (bookings: BookingData[]) => {
      // Wenn eine Stadt ausgewählt ist, filtere zuerst die Buchungen nach dieser Stadt
      const filteredBookings = selectedCity 
        ? bookings.filter(booking => booking.serviceCity === selectedCity)
        : bookings;

      const stats = new Map<string, {
        revenue: number;
        bookings: number;
        commission: number;
        nights: number;
        cancelledBookings: number;
        city: string;
      }>();

      filteredBookings.forEach((booking) => {
        if (!booking.serviceName) return;

        const current = stats.get(booking.serviceName) || {
          revenue: 0,
          bookings: 0,
          commission: 0,
          nights: 0,
          cancelledBookings: 0,
          city: booking.serviceCity || 'Unbekannt',
        };

        const price = typeof booking.totalPrice === 'number' ? booking.totalPrice : parseFloat(booking.totalPrice || '0');
        const commission = typeof booking.commission === 'number' ? booking.commission : parseFloat(booking.commission || '0');
        
        // Bei stornierten Buchungen Umsatz und Provision auf 0 setzen
        const finalPrice = booking.cancelled ? 0 : price;
        const finalCommission = booking.cancelled ? 0 : commission;
        
        // Berechne die Anzahl der Nächte aus An- und Abreisedatum
        let nights = 0;
        if (booking.arrivalDate && booking.departureDate) {
          try {
            nights = differenceInDays(booking.departureDate, booking.arrivalDate);
          } catch (e) {
            console.error('Fehler bei der Datumsberechnung:', e);
            console.error('Anreise:', booking.arrivalDate, 'Abreise:', booking.departureDate);
          }
        }

        stats.set(booking.serviceName, {
          revenue: current.revenue + finalPrice,
          bookings: current.bookings + 1,
          commission: current.commission + finalCommission,
          nights: current.nights + nights,
          cancelledBookings: current.cancelledBookings + (booking.cancelled ? 1 : 0),
          city: current.city,
        });
      });

      return stats;
    };

    // Berechne Statistiken für den Hauptzeitraum
    const currentStats = calculateStats(data);
    
    // Berechne Statistiken für den Vergleichszeitraum
    const compStats = comparisonData ? calculateStats(comparisonData) : new Map();

    // Kombiniere die Statistiken
    const combinedStats: AccommodationStats[] = [];

    // Verarbeite alle Unterkünfte aus den aktuellen Daten
    currentStats.forEach((current, name) => {
      const comparison = compStats.get(name);
      
      const stats: AccommodationStats = {
        name,
        city: current.city,
        revenue: current.revenue,
        bookings: current.bookings,
        commission: current.commission,
        nights: current.nights,
        cancelledBookings: current.cancelledBookings,
        comparisonRevenue: comparison?.revenue,
        comparisonBookings: comparison?.bookings,
        comparisonCommission: comparison?.commission,
        comparisonNights: comparison?.nights,
        comparisonCancelledBookings: comparison?.cancelledBookings
      };

      combinedStats.push(stats);
    });

    // Sortiere nach Umsatz und nimm die Top 30
    return combinedStats
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 30);
  }, [data, comparisonData, selectedCity]);

  // Extrahiere alle einzigartigen Städte aus den Daten
  const cities = useMemo(() => {
    const citySet = new Set<string>();
    data.forEach(booking => {
      if (booking.serviceCity) {
        citySet.add(booking.serviceCity);
      }
    });
    return Array.from(citySet).sort();
  }, [data]);

  // Filtere die Statistiken nach der ausgewählten Stadt
  const filteredAccommodationStats = accommodationStats.filter(stats => stats.city === selectedCity || selectedCity === '');

  const renderChangeCell = (change?: number) => {
    if (change === undefined) return null;
    
    const isPositive = change > 0;
    const Icon = isPositive ? ArrowUpIcon : ArrowDownIcon;
    
    return (
      <div className={`flex items-center ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        <Icon className="h-4 w-4 mr-1" />
        {formatPercentage(Math.abs(change))}
      </div>
    );
  };

  const getCancellationRateColor = (rate: number): string => {
    if (rate >= 0.2) return 'text-red-600';
    if (rate >= 0.1) return 'text-yellow-600';
    return 'text-green-600';
  };

  const exportToCSV = () => {
    const headers = [
      'Rang',
      'Unterkunft',
      'Stadt',
      'Umsatz',
      'Buchungen',
      'Provision',
      'Übernachtungen',
      'Stornierungen'
    ];

    if (comparisonData) {
      headers.push(
        'Umsatz Vorjahr',
        'Buchungen Vorjahr',
        'Provision Vorjahr',
        'Übernachtungen Vorjahr',
        'Stornierungen Vorjahr',
        'Umsatz Änderung',
        'Buchungen Änderung',
        'Provision Änderung',
        'Übernachtungen Änderung'
      );
    }

    const csvContent = [
      headers.join(';'),
      ...filteredAccommodationStats.map((stat, index) => {
        const row = [
          (index + 1).toString(),
          stat.name,
          stat.city,
          stat.revenue.toFixed(2),
          stat.bookings.toString(),
          stat.commission.toFixed(2),
          stat.nights.toString(),
          stat.cancelledBookings.toString()
        ];

        if (comparisonData) {
          row.push(
            stat.comparisonRevenue?.toFixed(2) ?? '',
            stat.comparisonBookings?.toString() ?? '',
            stat.comparisonCommission?.toFixed(2) ?? '',
            stat.comparisonNights?.toString() ?? '',
            stat.comparisonCancelledBookings?.toString() ?? '',
            stat.revenueChange ? formatPercentage(stat.revenueChange) : '',
            stat.bookingsChange ? formatPercentage(stat.bookingsChange) : '',
            stat.commissionChange ? formatPercentage(stat.commissionChange) : '',
            stat.nightsChange ? formatPercentage(stat.nightsChange) : ''
          );
        }

        return row.join(';');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `top_30_unterkuenfte_${format(startDate, 'yyyy-MM-dd')}_${format(endDate, 'yyyy-MM-dd')}.csv`;
    link.click();
    setShowExportMenu(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Setze Schriftart und -größe
    doc.setFont('helvetica');
    doc.setFontSize(12);

    // Definiere die Spaltenbreiten für das Querformat
    const columnWidths = {
      rank: 15,
      name: 90,
      city: 40,
      bookings: 25,
      revenue: 40,
      commission: 40,
      cancellationRate: 30
    };

    // Berechne die Startposition für die zentrierte Tabelle
    const pageWidth = doc.internal.pageSize.getWidth();
    const tableWidth = Object.values(columnWidths).reduce((sum, width) => sum + width, 0);
    const startX = (pageWidth - tableWidth) / 2;

    // Füge Titel hinzu
    doc.setFontSize(16);
    doc.text('Top 30 Unterkünfte', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(12);

    // Definiere die Spaltenüberschriften
    const headers = [
      'Rang',
      'Name',
      'Stadt',
      'Buchungen',
      'Umsatz',
      'Provision',
      'Storno %'
    ];

    // Erstelle die Tabellendaten
    const tableData = filteredAccommodationStats.map((item, index) => [
      (index + 1).toString(),
      item.name,
      item.city,
      item.bookings.toString(),
      formatCurrency(item.revenue),
      formatCurrency(item.commission),
      `${item.cancelledBookings / item.bookings * 100}%`
    ]);

    // Zeichne die Tabelle
    doc.autoTable({
      head: [headers],
      body: tableData,
      startY: 30,
      startX: startX,
      columnStyles: {
        0: { cellWidth: columnWidths.rank },
        1: { cellWidth: columnWidths.name },
        2: { cellWidth: columnWidths.city },
        3: { cellWidth: columnWidths.bookings },
        4: { cellWidth: columnWidths.revenue },
        5: { cellWidth: columnWidths.commission },
        6: { cellWidth: columnWidths.cancellationRate }
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        halign: 'center'
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250]
      },
      margin: { top: 30 },
      theme: 'grid'
    });

    // Speichere das PDF
    doc.save(`top_30_unterkuenfte_${format(startDate, 'yyyy-MM-dd')}_${format(endDate, 'yyyy-MM-dd')}.pdf`);
    setShowExportMenu(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="block w-64 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">Alle Städte</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
            Export
          </button>
          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
              <div className="py-1">
                <button
                  onClick={exportToCSV}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Als CSV exportieren
                </button>
                <button
                  onClick={exportToPDF}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Als PDF exportieren
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-300">
          <thead>
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                Rang
              </th>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                Unterkunft
              </th>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                Stadt
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                Umsatz
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                Provision
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                Buchungen
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                Nächte
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                Stornoquote
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredAccommodationStats.map((stats, index) => (
              <tr key={stats.name} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="py-4 pl-4 pr-3 text-sm text-gray-900">
                  {index + 1}
                </td>
                <td className="py-4 pl-4 pr-3 text-sm text-gray-900">
                  {stats.name}
                </td>
                <td className="py-4 pl-4 pr-3 text-sm text-gray-500">
                  {stats.city}
                </td>
                <td className="px-3 py-4 text-right text-sm text-gray-900">
                  {formatCurrency(stats.revenue)}
                </td>
                {comparisonData && comparisonStartDate && comparisonEndDate && (
                  <td className="px-3 py-4 text-right text-sm">
                    {renderChangeCell(stats.revenueChange)}
                  </td>
                )}
                <td className="px-3 py-4 text-right text-sm text-gray-900">
                  {formatCurrency(stats.commission)}
                </td>
                {comparisonData && comparisonStartDate && comparisonEndDate && (
                  <td className="px-3 py-4 text-right text-sm">
                    {renderChangeCell(stats.commissionChange)}
                  </td>
                )}
                <td className="px-3 py-4 text-right text-sm text-gray-900">
                  {stats.bookings}
                </td>
                {comparisonData && comparisonStartDate && comparisonEndDate && (
                  <td className="px-3 py-4 text-right text-sm">
                    {renderChangeCell(stats.bookingsChange)}
                  </td>
                )}
                <td className="px-3 py-4 text-right text-sm text-gray-900">
                  {stats.nights}
                </td>
                {comparisonData && comparisonStartDate && comparisonEndDate && (
                  <td className="px-3 py-4 text-right text-sm">
                    {renderChangeCell(stats.nightsChange)}
                  </td>
                )}
                <td className={`px-3 py-4 text-right text-sm ${getCancellationRateColor(stats.cancelledBookings / stats.bookings)}`}>
                  {formatPercentage(stats.cancelledBookings / stats.bookings)}
                </td>
                {comparisonData && comparisonStartDate && comparisonEndDate && (
                  <td className="px-3 py-4 text-right text-sm">
                    {renderChangeCell(stats.cancellationRateChange)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
