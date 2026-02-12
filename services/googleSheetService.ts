
import { DashboardData, InvoiceMetadata, ProductionLineItem } from '../types';

const SHEET_URL = 'https://docs.google.com/spreadsheets/u/0/d/1-amnAYKkoKKXtZ3rzirg0K9gnD6lUFOqV2hqFf5iPEQ/htmlview#gid=552593670';

function parseCSV(csvText: string): string[][] {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      }
      if (char === '\r' && csvText[i + 1] === '\n') i++;
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }
  return rows;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const response = await fetch(SHEET_URL);
  if (!response.ok) throw new Error('Failed to fetch spreadsheet data');
  const csvText = await response.text();
  const rows = parseCSV(csvText);

  // Parse Invoices Metadata (Rows 1-5, starting from Column Q (index 16))
  const invoices: InvoiceMetadata[] = [];
  if (rows.length >= 5) {
    const startCol = 16; // Column Q
    for (let col = startCol; col < rows[0].length; col++) {
      if (!rows[0][col]) break;
      invoices.push({
        brand: rows[0][col] || '',
        exportDate: rows[1][col] || '',
        totalQty: parseInt(rows[2][col].replace(/,/g, '')) || 0,
        containerInfo: rows[3][col] || '',
        invoiceTitle: rows[4][col] || '',
      });
    }
  }

  // Parse Line Items (Row 6 onwards, index 5)
  const items: ProductionLineItem[] = [];
  
  // Explicitly initialize summary counters to ensure they only total until LIMIT
  let totalPoQty = 0;
  let totalStockIn = 0;
  let totalRemaining = 0;
  let totalRework = 0;
  let totalInventory = 0;

  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    // Check for "LIMIT" sentinel in ANY cell of the row (case insensitive)
    if (r.some(cell => cell && typeof cell === 'string' && cell.trim().toUpperCase() === 'LIMIT')) {
      break;
    }

    // Skip truly empty rows that aren't the LIMIT row
    if (!r[0] && !r[1] && !r[2] && !r[8]) continue;

    const invoiceQtys: number[] = [];
    for (let col = 16; col < r.length; col++) {
      invoiceQtys.push(parseInt(r[col]?.replace(/,/g, '')) || 0);
    }

    // Mapping columns for calculation:
    // I (8): poQty, J (9): stockIn, K (10): remaining, N (13): rework, O (14): inventory
    const poQtyVal = parseInt(r[8]?.replace(/,/g, '')) || 0;
    const stockInVal = parseInt(r[9]?.replace(/,/g, '')) || 0;
    const remainingVal = parseInt(r[10]?.replace(/,/g, '')) || 0;
    const reworkVal = parseInt(r[13]?.replace(/,/g, '')) || 0;
    const inventoryVal = parseInt(r[14]?.replace(/,/g, '')) || 0;

    // Accumulate summary totals strictly for the rows before LIMIT
    totalPoQty += poQtyVal;
    totalStockIn += stockInVal;
    totalRemaining += remainingVal;
    totalRework += reworkVal;
    totalInventory += inventoryVal;

    items.push({
      poNo: r[0] || '',
      woNo: r[1] || '',
      partNo: r[2] || '',
      customer: r[3] || '',
      itemType: r[4] || '',
      size: r[5] || '',
      color: r[7] || '', 
      poQty: poQtyVal,
      stockIn: stockInVal,
      remaining: remainingVal,
      usedForShipment: parseInt(r[11]?.replace(/,/g, '')) || 0,
      readyForShipment: parseInt(r[12]?.replace(/,/g, '')) || 0,
      reworkQty: reworkVal,
      finishedGoodsInventory: inventoryVal,
      invoiceQtys,
    });
  }

  const summary = {
    totalPoQty,
    totalStockIn,
    totalRemaining,
    totalRework,
    totalInventory
  };

  return { invoices, items, summary };
}
