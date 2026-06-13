import Papa from "papaparse";

export interface CsvBetRow {
  DatePlaced: string;
  Bookie: string;
  Event: string;
  Market: string;
  Stake: string | number;
  Currency: string;
  Odds: string | number;
  Type: string;
  PairID?: string;
  IsFreeBet: string;
  Outcome: string;
  Return?: string | number;
  CLV?: string | number;
  Notes?: string;
}

export const CSV_HEADERS = [
  "DatePlaced",
  "Bookie",
  "Event",
  "Market",
  "Stake",
  "Currency",
  "Odds",
  "Type",
  "PairID",
  "IsFreeBet",
  "Outcome",
  "Return",
  "CLV",
  "Notes",
];

export function parseCsv<T = CsvBetRow>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err),
    });
  });
}

export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  return Papa.unparse(rows, { columns: headers });
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
