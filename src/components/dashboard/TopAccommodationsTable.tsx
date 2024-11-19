import React, { useMemo, useState } from 'react';
import { BookingData } from '../../types/booking';
import { formatCurrency, formatPercentage } from '../../utils/formatters';
import { ArrowDownIcon, ArrowUpIcon, ArrowDownTrayIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import { differenceInDays, parse, format, isWithinInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import jsPDF from 'jspdf';

interface TopAccommodationsTableProps {
  data: BookingData[];
  isYearComparison?: boolean;
  comparisonData?: BookingData[];
  startDate?: Date;
  endDate?: Date;
  comparisonStartDate?: Date;
  comparisonEndDate?: Date;
}

type AccommodationStats = {
  spId: string; // Neue Eigenschaft für die Objektnummer
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
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [expandedAccommodation, setExpandedAccommodation] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [minBookings, setMinBookings] = useState<number | ''>('');
  const [minCancellationRate, setMinCancellationRate] = useState<number | ''>('');
  const itemsPerPage = 30;

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (!current || current.key !== key) {
        return { key, direction: 'desc' };
      }
      if (current.direction === 'desc') {
        return { key, direction: 'asc' };
      }
      return null;
    });
  };

  const getSortedStats = (stats: any[]) => {
    if (!sortConfig) return stats;

    return [...stats].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Spezielle Behandlung für berechnete Werte
      if (sortConfig.key === 'cancellationRate') {
        aValue = a.cancelledBookings / a.bookings;
        bValue = b.cancelledBookings / b.bookings;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const accommodationStats = useMemo(() => {
    const stats = new Map<string, {
      spId: string; // Neue Eigenschaft für die Objektnummer
      name: string;
      city: string;
      revenue: number;
      commission: number;
      bookings: number;
      nights: number;
      cancelledBookings: number;
      revenueChange?: number;
      commissionChange?: number;
      bookingsChange?: number;
      nightsChange?: number;
      cancellationRateChange?: number;
    }>();

    // Verarbeite aktuelle Daten
    data.forEach(booking => {
      if (!booking.serviceName) return;

      const current = stats.get(booking.serviceName) || {
        spId: booking.spId, // Korrigierte Eigenschaft für die Objektnummer
        name: booking.serviceName,
        city: booking.serviceCity || '',
        revenue: 0,
        commission: 0,
        bookings: 0,
        nights: 0,
        cancelledBookings: 0,
      };

      current.revenue += booking.totalPrice;
      current.commission += booking.commission;
      current.bookings += 1;
      if (booking.cancelled) {
        current.cancelledBookings += 1;
      }
      
      const nights = differenceInDays(
        new Date(booking.departureDate),
        new Date(booking.arrivalDate)
      );
      current.nights += nights;

      stats.set(booking.serviceName, current);
    });

    // Wenn Vergleichsdaten vorhanden sind, berechne die Änderungen
    if (comparisonData && comparisonStartDate && comparisonEndDate) {
      const comparisonStats = new Map<string, {
        revenue: number;
        commission: number;
        bookings: number;
        cancelledBookings: number;
        nights: number;
      }>();

      comparisonData.forEach(booking => {
        if (!booking.serviceName) return;

        const current = comparisonStats.get(booking.serviceName) || {
          revenue: 0,
          commission: 0,
          bookings: 0,
          cancelledBookings: 0,
          nights: 0
        };

        current.revenue += booking.totalPrice;
        current.commission += booking.commission;
        current.bookings += 1;
        if (booking.cancelled) {
          current.cancelledBookings += 1;
        }
        
        const nights = differenceInDays(
          new Date(booking.departureDate),
          new Date(booking.arrivalDate)
        );
        current.nights += nights;

        comparisonStats.set(booking.serviceName, current);
      });

      // Berechne die prozentualen Änderungen
      stats.forEach((value, key) => {
        const comparison = comparisonStats.get(key);
        if (comparison) {
          value.revenueChange = ((value.revenue - comparison.revenue) / comparison.revenue) * 100;
          value.commissionChange = ((value.commission - comparison.commission) / comparison.commission) * 100;
          value.bookingsChange = ((value.bookings - comparison.bookings) / comparison.bookings) * 100;
          value.nightsChange = ((value.nights - comparison.nights) / comparison.nights) * 100;
          
          const currentCancellationRate = value.cancelledBookings / value.bookings;
          const comparisonCancellationRate = comparison.cancelledBookings / comparison.bookings;
          value.cancellationRateChange = ((currentCancellationRate - comparisonCancellationRate) / comparisonCancellationRate) * 100;
        }
      });
    }

    return Array.from(stats.values());
  }, [data, comparisonData]);

  // Filtere zuerst nach minimalen Buchungen
  const bookingsFiltered = useMemo(() => {
    if (minBookings === '') return accommodationStats;
    return accommodationStats.filter(stats => stats.bookings >= Number(minBookings));
  }, [accommodationStats, minBookings]);

  // Filtere nach Stornierungsquote
  const cancellationFiltered = useMemo(() => {
    if (minCancellationRate === '') return accommodationStats;
    return accommodationStats.filter(stats => {
      const cancellationRate = (stats.cancelledBookings / stats.bookings) * 100;
      return cancellationRate >= Number(minCancellationRate);
    });
  }, [accommodationStats, minCancellationRate]);

  // Kombiniere alle Filter
  const filteredAccommodationStats = useMemo(() => {
    let filtered = accommodationStats;
    
    // Wende Buchungsfilter an
    if (minBookings !== '') {
      filtered = filtered.filter(stats => stats.bookings >= Number(minBookings));
    }

    // Wende Stornierungsquotenfilter an
    if (minCancellationRate !== '') {
      filtered = filtered.filter(stats => {
        const cancellationRate = (stats.cancelledBookings / stats.bookings) * 100;
        return cancellationRate >= Number(minCancellationRate);
      });
    }

    // Wende Stadtfilter an
    filtered = filtered.filter(stats => stats.city === selectedCity || selectedCity === '');

    return filtered;
  }, [accommodationStats, minBookings, minCancellationRate, selectedCity]);

  // Funktion zum Umschalten des Dropdown-Status
  const toggleAccommodation = (name: string) => {
    setExpandedAccommodation(expandedAccommodation === name ? null : name);
  };

  // Funktion zum Abrufen der detaillierten Buchungen für eine Unterkunft
  const getAccommodationBookings = (name: string) => {
    return data.filter(booking => booking.serviceName === name)
      .map(booking => ({
        ...booking,
        bookingDate: new Date(booking.bookingDate),
        arrivalDate: new Date(booking.arrivalDate),
        departureDate: new Date(booking.departureDate),
      }))
      .sort((a, b) => b.arrivalDate.getTime() - a.arrivalDate.getTime());
  };

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

  // Berechne die Gesamtanzahl der Seiten
  const totalPages = Math.ceil(filteredAccommodationStats.length / itemsPerPage);

  // Hole die Einträge für die aktuelle Seite
  const getCurrentPageItems = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return getSortedStats(filteredAccommodationStats).slice(startIndex, endIndex);
  };

  // Funktion zum Ändern der Seite
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    setExpandedAccommodation(null); // Schließe expandierte Details beim Seitenwechsel
  };

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

  const handleExport = (format: 'csv' | 'pdf') => {
    const headers = [
      'Name',
      'Stadt',
      'SpID',
      'Buchungen',
      'Stornierte Buchungen',
      'Stornierungsquote (%)',
      'Durchschn. Buchungswert (€)',
      'Gesamtumsatz (€)'
    ];

    // Verwende die gefilterten Daten für den Export
    const dataToExport = filteredAccommodationStats.map(stats => {
      const cancellationRate = ((stats.cancelledBookings / stats.bookings) * 100).toFixed(2);
      const averageBookingValue = (stats.revenue / stats.bookings).toFixed(2);
      
      return [
        stats.name,
        stats.city,
        stats.spId,
        stats.bookings.toString(),
        stats.cancelledBookings.toString(),
        cancellationRate,
        averageBookingValue,
        stats.revenue.toFixed(2)
      ];
    });

    if (format === 'csv') {
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'accommodation_statistics.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      
      // Füge einen Titel hinzu
      doc.setFontSize(16);
      doc.text('Unterkunftsstatistiken', 14, 20);
      
      // Füge Filterinformationen hinzu
      doc.setFontSize(10);
      let yPos = 30;
      if (minBookings !== '') {
        doc.text(`Mindestanzahl Buchungen: ${minBookings}`, 14, yPos);
        yPos += 6;
      }
      if (minCancellationRate !== '') {
        doc.text(`Minimale Stornierungsquote: ${minCancellationRate}%`, 14, yPos);
        yPos += 6;
      }
      if (selectedCity) {
        doc.text(`Stadt: ${selectedCity}`, 14, yPos);
        yPos += 6;
      }

      // Füge die Tabelle hinzu
      doc.autoTable({
        head: [headers],
        body: dataToExport,
        startY: yPos,
        margin: { top: 10 },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 40 }, // Name
          1: { cellWidth: 30 }, // Stadt
          2: { cellWidth: 20 }, // SpID
          3: { cellWidth: 20 }, // Buchungen
          4: { cellWidth: 20 }, // Stornierte Buchungen
          5: { cellWidth: 20 }, // Stornierungsquote
          6: { cellWidth: 20 }, // Durchschn. Buchungswert
          7: { cellWidth: 20 }  // Gesamtumsatz
        }
      });

      doc.save('accommodation_statistics.pdf');
    }
    setShowExportMenu(false);
  };

  return (
    <div className="mt-8 flow-root">
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
                  onClick={() => handleExport('csv')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Als CSV exportieren
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Als PDF exportieren
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="minBookings" className="block text-sm font-medium text-gray-700">
            Minimale Anzahl Buchungen
          </label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              type="number"
              name="minBookings"
              id="minBookings"
              value={minBookings}
              onChange={(e) => {
                setMinBookings(e.target.value === '' ? '' : Number(e.target.value));
              }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Min. Anzahl Buchungen..."
              min="0"
            />
          </div>
          {minBookings !== '' && (
            <p className="mt-1 text-sm text-gray-500">
              {bookingsFiltered.length} Unterkünfte mit mindestens {minBookings} Buchungen
            </p>
          )}
        </div>

        <div>
          <label htmlFor="minCancellationRate" className="block text-sm font-medium text-gray-700">
            Minimale Stornierungsquote (%)
          </label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              type="number"
              name="minCancellationRate"
              id="minCancellationRate"
              value={minCancellationRate}
              onChange={(e) => setMinCancellationRate(e.target.value === '' ? '' : Number(e.target.value))}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Min. Stornierungsquote in %..."
              min="0"
              max="100"
              step="0.1"
            />
          </div>
          {minCancellationRate !== '' && (
            <p className="mt-1 text-sm text-gray-500">
              {cancellationFiltered.length} Unterkünfte mit Stornierungsquote ≥ {minCancellationRate}%
            </p>
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
                Objektnummer
              </th>
              <th 
                className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center">
                  Unterkunft
                  {sortConfig?.key === 'name' && (
                    sortConfig.direction === 'desc' ? 
                    <ArrowDownIcon className="h-4 w-4 ml-1" /> : 
                    <ArrowUpIcon className="h-4 w-4 ml-1" />
                  )}
                </div>
              </th>
              <th 
                className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('city')}
              >
                <div className="flex items-center">
                  Stadt
                  {sortConfig?.key === 'city' && (
                    sortConfig.direction === 'desc' ? 
                    <ArrowDownIcon className="h-4 w-4 ml-1" /> : 
                    <ArrowUpIcon className="h-4 w-4 ml-1" />
                  )}
                </div>
              </th>
              <th 
                className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('revenue')}
              >
                <div className="flex items-center justify-end">
                  Umsatz
                  {sortConfig?.key === 'revenue' && (
                    sortConfig.direction === 'desc' ? 
                    <ArrowDownIcon className="h-4 w-4 ml-1" /> : 
                    <ArrowUpIcon className="h-4 w-4 ml-1" />
                  )}
                </div>
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
              <th 
                className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('commission')}
              >
                <div className="flex items-center justify-end">
                  Provision
                  {sortConfig?.key === 'commission' && (
                    sortConfig.direction === 'desc' ? 
                    <ArrowDownIcon className="h-4 w-4 ml-1" /> : 
                    <ArrowUpIcon className="h-4 w-4 ml-1" />
                  )}
                </div>
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
              <th 
                className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('bookings')}
              >
                <div className="flex items-center justify-end">
                  Buchungen
                  {sortConfig?.key === 'bookings' && (
                    sortConfig.direction === 'desc' ? 
                    <ArrowDownIcon className="h-4 w-4 ml-1" /> : 
                    <ArrowUpIcon className="h-4 w-4 ml-1" />
                  )}
                </div>
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
              <th 
                className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('nights')}
              >
                <div className="flex items-center justify-end">
                  Nächte
                  {sortConfig?.key === 'nights' && (
                    sortConfig.direction === 'desc' ? 
                    <ArrowDownIcon className="h-4 w-4 ml-1" /> : 
                    <ArrowUpIcon className="h-4 w-4 ml-1" />
                  )}
                </div>
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
              <th 
                className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('cancellationRate')}
              >
                <div className="flex items-center justify-end">
                  Stornoquote
                  {sortConfig?.key === 'cancellationRate' && (
                    sortConfig.direction === 'desc' ? 
                    <ArrowDownIcon className="h-4 w-4 ml-1" /> : 
                    <ArrowUpIcon className="h-4 w-4 ml-1" />
                  )}
                </div>
              </th>
              {comparisonData && comparisonStartDate && comparisonEndDate && (
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                  Änderung
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {getCurrentPageItems().map((stats, index) => (
              <React.Fragment key={stats.name}>
                <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-4 pl-4 pr-3 text-sm text-gray-900">
                    {((currentPage - 1) * itemsPerPage) + index + 1}
                  </td>
                  <td className="py-4 pl-4 pr-3 text-sm text-gray-900">
                    {stats.spId}
                  </td>
                  <td className="py-4 pl-4 pr-3 text-sm text-gray-900">
                    <button
                      onClick={() => toggleAccommodation(stats.name)}
                      className="flex items-center space-x-2 hover:text-gray-600"
                    >
                      {expandedAccommodation === stats.name ? 
                        <ChevronUpIcon className="h-4 w-4" /> : 
                        <ChevronDownIcon className="h-4 w-4" />
                      }
                      <span>{stats.name}</span>
                    </button>
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
                {expandedAccommodation === stats.name && (
                  <tr>
                    <td colSpan={12} className="px-4 py-4 bg-gray-50">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Buchungsnummer</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Buchungsdatum</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Anreise</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Abreise</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Preis</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Provision</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Erw.</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Kinder</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">PLZ</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Stadt</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {getAccommodationBookings(stats.name).map((booking, bookingIndex) => (
                              <tr key={booking.bookingCode} className={bookingIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {booking.bookingCode}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {format(booking.bookingDate, 'dd.MM.yyyy', { locale: de })}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {format(booking.arrivalDate, 'dd.MM.yyyy', { locale: de })}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {format(booking.departureDate, 'dd.MM.yyyy', { locale: de })}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500 text-right">
                                  {formatCurrency(booking.totalPrice)}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500 text-right">
                                  {formatCurrency(booking.commission)}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500 text-center">
                                  {booking.adults}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500 text-center">
                                  {booking.children}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {booking.postalCode}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {booking.city}
                                </td>
                                <td className="px-3 py-2 text-xs text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                                    ${booking.cancelled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    {booking.cancelled ? 'Storniert' : 'Aktiv'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginierung */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
        <div className="flex flex-1 justify-between sm:hidden">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 ${
              currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
            }`}
          >
            Zurück
          </button>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 ${
              currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
            }`}
          >
            Weiter
          </button>
        </div>
        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Zeige <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> bis{' '}
              <span className="font-medium">
                {Math.min(currentPage * itemsPerPage, filteredAccommodationStats.length)}
              </span>{' '}
              von{' '}
              <span className="font-medium">{filteredAccommodationStats.length}</span> Unterkünften
            </p>
          </div>
          <div>
            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 ${
                  currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
                }`}
              >
                <span className="sr-only">Zurück</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                </svg>
              </button>
              {[...Array(totalPages)].map((_, i) => {
                const pageNumber = i + 1;
                // Zeige maximal 5 Seitenzahlen an
                if (
                  pageNumber === 1 ||
                  pageNumber === totalPages ||
                  (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={pageNumber}
                      onClick={() => handlePageChange(pageNumber)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                        currentPage === pageNumber
                          ? 'z-10 bg-indigo-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                          : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                } else if (
                  (pageNumber === currentPage - 2 && pageNumber > 2) ||
                  (pageNumber === currentPage + 2 && pageNumber < totalPages - 1)
                ) {
                  return (
                    <span
                      key={pageNumber}
                      className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                    >
                      ...
                    </span>
                  );
                }
                return null;
              })}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 ${
                  currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
                }`}
              >
                <span className="sr-only">Weiter</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06.02z" clipRule="evenodd" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
