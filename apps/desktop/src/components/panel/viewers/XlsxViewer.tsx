import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ExcelJS from "exceljs";
import { errorMessage, readBinaryFile } from "../../../lib/api";
import { Button } from "../../ui/Button";
import { ViewerState, ViewerToolbar, useZoom } from "./ViewerToolbar";

const MAX_ROWS = 5_000;
const MAX_COLS = 200;

interface Sheet {
  name: string;
  rows: string[][];
  totalRows: number;
  maxCols: number;
}

function parseCsv(text: string): Sheet[] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let totalRows = 0;
  let maxCols = 0;
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  const commitRow = () => {
    current.push(field);
    field = "";
    const trimmed = current.slice(0, MAX_COLS);
    current = [];
    if (trimmed.every((c) => !c)) return;
    totalRows += 1;
    if (trimmed.length > maxCols) maxCols = trimmed.length;
    if (rows.length < MAX_ROWS) rows.push(trimmed);
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      current.push(field);
      field = "";
    } else if (ch === "\r") {
      if (input[i + 1] === "\n") i += 1;
      commitRow();
    } else if (ch === "\n") {
      commitRow();
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || current.length > 0) {
    commitRow();
  }

  return [{ name: "Sheet1", rows, totalRows, maxCols }];
}

function formatCellValue(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
    if ("result" in value) {
      return formatCellValue(value.result as ExcelJS.CellValue);
    }
    if ("error" in value && typeof value.error === "string") {
      return value.error;
    }
  }
  return String(value);
}

async function parseSpreadsheet(path: string, buffer: ArrayBuffer): Promise<Sheet[]> {
  if (path.toLowerCase().endsWith(".csv")) {
    return parseCsv(new TextDecoder("utf-8").decode(buffer));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  return workbook.worksheets.map((worksheet) => {
    const rows: string[][] = [];
    let totalRows = 0;
    let maxCols = 0;

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const colLimit = Math.min(row.cellCount, MAX_COLS);
      const cells: string[] = [];
      for (let col = 1; col <= colLimit; col += 1) {
        cells.push(formatCellValue(row.getCell(col).value));
      }
      if (cells.every((c) => !c)) return;
      totalRows += 1;
      if (cells.length > maxCols) maxCols = cells.length;
      if (rows.length < MAX_ROWS) rows.push(cells);
    });

    return { name: worksheet.name, rows, totalRows, maxCols };
  });
}

export function XlsxViewer({ path }: { path: string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const zoom = useZoom(0.6, 2, 0.1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setError(null);
    readBinaryFile(path)
      .then((buffer) => parseSpreadsheet(path, buffer))
      .then(
        (parsed) => {
          if (cancelled) return;
          setSheets(parsed);
          setActive(0);
        },
        (e) => {
          if (!cancelled) setError(errorMessage(e));
        }
      );
    return () => {
      cancelled = true;
    };
  }, [path]);

  const sheet = sheets?.[active];
  const rowHeight = Math.max(22, Math.round(28 * zoom.zoom));
  const fontSize = Math.round(12 * zoom.zoom);
  const colSpan = (sheet?.maxCols ?? 0) + 1;

  const virtualizer = useVirtualizer({
    count: sheet?.rows.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 15,
  });

  useEffect(() => virtualizer.measure(), [rowHeight, active, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const top = items[0]?.start ?? 0;
  const bottom = items.length ? Math.max(0, virtualizer.getTotalSize() - items[items.length - 1].end) : 0;

  return (
    <>
      <ViewerToolbar
        path={path}
        meta={sheet ? `${sheet.totalRows.toLocaleString()} rows` : undefined}
        zoom={sheets ? zoom : undefined}
      />
      <ViewerState loading={!sheets && !error} error={error} label="Loading spreadsheet…" />
      {sheets && (
        <div ref={scrollRef} className="sheet selectable" role="tabpanel">
          {sheet && sheet.totalRows > sheet.rows.length && (
            <div className="sheet-note">
              Showing first {sheet.rows.length.toLocaleString()} of {sheet.totalRows.toLocaleString()} rows
            </div>
          )}
          {sheet?.rows.length ? (
            <table style={{ fontSize }}>
              <tbody>
                {top > 0 && (
                  <tr style={{ height: top }}>
                    <td colSpan={colSpan} />
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.key} style={{ height: rowHeight }}>
                    <td>{item.index + 1}</td>
                    {sheet.rows[item.index].map((cell, i) => (
                      <td key={i} title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
                {bottom > 0 && (
                  <tr style={{ height: bottom }}>
                    <td colSpan={colSpan} />
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="empty">No data in this sheet</p>
          )}
        </div>
      )}
      {sheets && sheets.length > 1 && (
        <div className="sheet-tabs" role="tablist" aria-label="Sheets">
          {sheets.map((s, i) => (
            <Button
              key={`${s.name}-${i}`}
              size="sm"
              role="tab"
              aria-selected={i === active}
              active={i === active}
              onClick={() => {
                setActive(i);
                if (scrollRef.current) scrollRef.current.scrollTop = 0;
              }}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
