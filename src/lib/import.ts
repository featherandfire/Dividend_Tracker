// Generic CSV/Excel parser for brokerage holdings exports. Runs client-side.
import Papa from "papaparse";
import * as XLSX from "xlsx";

export type Cell = string | number | null;
export type Row = Cell[];

export type ColumnRole = "ticker" | "shares" | "cost_per_share" | "cost_total" | "ignore";

export type ParsedSheet = {
  rows: Row[];
  headerRowIndex: number;
  headers: string[];
  detectedRoles: ColumnRole[];
  format?: "generic" | "wellstrade-popup";
};

export type ImportRow = {
  ticker: string;
  shares: number;
  costBasis: number; // per share
  notes?: string;
  raw: Record<string, Cell>;
};

const TICKER_HINTS = ["symbol", "ticker", "sym ", "sym\t", "stock symbol", "security symbol", "secid", " sym", "sym."];
const SHARES_HINTS = ["quantity", "shares", "qty", "position", "units", "shares held", "share qty"];
const COST_PER_SHARE_HINTS = ["average cost", "avg cost", "avg price", "average price", "unit cost", "cost per share", "cost basis per share", "avg unit"];
const COST_TOTAL_HINTS = ["cost basis", "total cost", "cost", "book value", "total cost basis", "total book"];

const MAX_PREVIEW_ROWS = 1000;

export async function parseFile(file: File): Promise<ParsedSheet> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "tsv" || ext === "txt") return parseCsv(await file.text());
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") return parseExcel(await file.arrayBuffer());
  throw new Error(`Unsupported file type: .${ext}`);
}

function parseCsv(text: string): ParsedSheet {
  const result = Papa.parse<Row>(text, { skipEmptyLines: "greedy" });
  const rows = result.data.map((r) => r.map(normalizeCell));
  return finalize(rows);
}

function parseExcel(buf: ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, blankrows: false, defval: null });
  return finalize(rows.map((r) => r.map(normalizeCell)));
}

function normalizeCell(v: unknown): Cell {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function finalize(allRows: Row[]): ParsedSheet {
  if (allRows.length === 0) throw new Error("File is empty");

  // Detect known scraped-table formats first.
  const wellstrade = tryWellstradePopup(allRows);
  if (wellstrade) return wellstrade;

  // Generic single-row-per-holding flow.
  const headerRowIndex = detectHeaderRow(allRows);
  const headerRow = allRows[headerRowIndex];
  const headers = headerRow.map((c) => (c == null ? "" : String(c)));
  const detectedRoles = detectRoles(headers);
  const dataRows = allRows.slice(headerRowIndex + 1, headerRowIndex + 1 + MAX_PREVIEW_ROWS);
  return { rows: dataRows, headerRowIndex, headers, detectedRoles, format: "generic" };
}

// Find the header row: the first row with >=3 non-empty string cells where at least one looks like a known header.
function detectHeaderRow(rows: Row[]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    const stringCells = row.filter((c) => typeof c === "string" && c.length > 0) as string[];
    if (stringCells.length < 3) continue;
    const lower = stringCells.map((s) => s.toLowerCase());
    if (lower.some((s) => TICKER_HINTS.some((h) => s.includes(h.trim())))) return i;
  }
  return 0;
}

function detectRoles(headers: string[]): ColumnRole[] {
  const lower = headers.map((h) => (h ?? "").toLowerCase());

  let tickerIdx = lower.findIndex((h) => /\b(symbol|ticker)\b/.test(h));
  if (tickerIdx < 0) tickerIdx = lower.findIndex((h) => TICKER_HINTS.some((hint) => h.includes(hint.trim())));

  const sharesIdx = lower.findIndex((h) => SHARES_HINTS.some((hint) => h.includes(hint)));

  let costPerShareIdx = lower.findIndex((h) => COST_PER_SHARE_HINTS.some((hint) => h.includes(hint)));
  let costTotalIdx = -1;
  if (costPerShareIdx < 0) {
    costTotalIdx = lower.findIndex((h) => COST_TOTAL_HINTS.some((hint) => h.includes(hint)));
  }

  return headers.map((_, i) => {
    if (i === tickerIdx) return "ticker";
    if (i === sharesIdx) return "shares";
    if (i === costPerShareIdx) return "cost_per_share";
    if (i === costTotalIdx) return "cost_total";
    return "ignore";
  });
}

// Wellstrade web-scraped table: 2 columns, two rows per holding.
//   row N:   "TICKER,popup",  SHARES
//   row N+1: COMPANY NAME,    @ $COST
// Detected when the header reads "Symbol/Description...,Shares" OR many col-0 cells contain ",popup".
function tryWellstradePopup(allRows: Row[]): ParsedSheet | null {
  const sample = allRows.slice(0, 20);
  const popupHits = sample.filter((r) => typeof r[0] === "string" && /,popup\b/i.test(r[0] as string)).length;
  const headerLooksLikeWellstrade = sample.some((r) => {
    const a = (r[0] ?? "").toString().toLowerCase();
    const b = (r[1] ?? "").toString().toLowerCase();
    return a.includes("symbol/description") && b.includes("share");
  });
  if (popupHits < 2 && !headerLooksLikeWellstrade) return null;

  // Walk rows pair-wise, tolerant of orphan/malformed rows in between.
  const stitched: Row[] = [];
  for (let i = 0; i < allRows.length; ) {
    const row = allRows[i];
    const tickerCell = row[0];
    const tickerMatch = typeof tickerCell === "string" && /,popup\b/i.test(tickerCell)
      ? (tickerCell as string).split(",")[0].trim().toUpperCase()
      : null;

    if (!tickerMatch) {
      i += 1;
      continue;
    }

    const sharesNum = toNumber(row[1]);

    // Look for the description+cost row immediately after.
    const next = allRows[i + 1];
    let description = "";
    let costPerShare = 0;
    let consumedNext = false;
    if (next) {
      const descCell = next[0];
      const costCell = next[1];
      const costStr = costCell == null ? "" : String(costCell).trim();
      const costMatch = costStr.match(/@?\s*\$?\s*([0-9.,]+)/);
      const isLikelyDescriptionRow = (typeof descCell === "string" || descCell == null) &&
        (typeof costCell === "string" || costCell == null) &&
        (descCell == null || !/,popup\b/i.test(String(descCell)));
      if (isLikelyDescriptionRow && costMatch) {
        description = descCell == null ? "" : String(descCell);
        costPerShare = Number(costMatch[1].replace(/,/g, ""));
        consumedNext = true;
      }
    }

    if (sharesNum > 0) {
      stitched.push([tickerMatch, description, sharesNum, Number.isFinite(costPerShare) ? costPerShare : 0]);
    }
    i += consumedNext ? 2 : 1;
  }

  const headers = ["Ticker", "Description", "Shares", "Avg Cost"];
  const detectedRoles: ColumnRole[] = ["ticker", "ignore", "shares", "cost_per_share"];
  return {
    rows: stitched.slice(0, MAX_PREVIEW_ROWS),
    headerRowIndex: 0,
    headers,
    detectedRoles,
    format: "wellstrade-popup",
  };
}

// Convert a sheet + role assignment into clean import rows. Skips rows missing ticker or shares.
export function buildImportRows(sheet: ParsedSheet, roles: ColumnRole[]): { rows: ImportRow[]; skipped: number } {
  const tickerIdx = roles.indexOf("ticker");
  const sharesIdx = roles.indexOf("shares");
  const cpsIdx = roles.indexOf("cost_per_share");
  const ctIdx = roles.indexOf("cost_total");

  if (tickerIdx < 0 || sharesIdx < 0) return { rows: [], skipped: sheet.rows.length };

  let skipped = 0;
  const seen = new Set<string>();
  const out: ImportRow[] = [];
  for (const r of sheet.rows) {
    const tickerRaw = r[tickerIdx];
    const sharesRaw = r[sharesIdx];
    const ticker = cleanTicker(tickerRaw);
    const shares = toNumber(sharesRaw);

    if (!ticker || !(shares > 0) || seen.has(ticker)) {
      skipped++;
      continue;
    }
    seen.add(ticker);

    let costBasis = 0;
    if (cpsIdx >= 0) {
      costBasis = toNumber(r[cpsIdx]);
    } else if (ctIdx >= 0) {
      const total = toNumber(r[ctIdx]);
      costBasis = total > 0 ? total / shares : 0;
    }
    if (!Number.isFinite(costBasis) || costBasis < 0) costBasis = 0;

    const raw: Record<string, Cell> = {};
    sheet.headers.forEach((h, i) => {
      if (h) raw[h] = r[i] ?? null;
    });

    out.push({ ticker, shares, costBasis, raw });
  }
  return { rows: out, skipped };
}

function cleanTicker(v: Cell): string {
  if (v == null) return "";
  let s = String(v).trim().toUpperCase();
  // Strip trailing ",POPUP" leftovers (Wellstrade web scrape).
  s = s.replace(/,POPUP\b/i, "").trim();
  // Strip exchange suffixes like AAPL.US (but keep BRK.B, BF.A, etc.).
  if (/^[A-Z]+\.US$/.test(s)) s = s.replace(/\.US$/, "");
  // Reject obvious non-tickers.
  if (/^(CASH|TOTAL|MMF|MMRXX|SUBTOTAL|N\/A|--)$/i.test(s)) return "";
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) return "";
  return s;
}

function toNumber(v: Cell): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/[$,\s]/g, "");
  // Strip "@" used as cost prefix in scraped tables.
  s = s.replace(/^@/, "");
  if (s.startsWith("(") && s.endsWith(")")) s = "-" + s.slice(1, -1);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  ticker: "Ticker",
  shares: "Shares",
  cost_per_share: "Avg cost / share",
  cost_total: "Total cost basis",
  ignore: "Ignore",
};
