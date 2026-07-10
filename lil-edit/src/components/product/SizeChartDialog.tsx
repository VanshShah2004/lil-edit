import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StockToggleSlider from "@/components/StockToggleSlider";
import { alphaSizeForAgeRange } from "@/lib/sizeLabels";
import type { ProductSizeChart, SizeChartMeasurements, SizeChartRow } from "@/types/product";

const COLUMNS: { key: keyof SizeChartMeasurements; label: string }[] = [
  { key: "topLength", label: "Top Length" },
  { key: "chest", label: "Chest" },
  { key: "sleeve", label: "Sleeve" },
  { key: "bottomLength", label: "Bottom Length" },
  { key: "waist", label: "Waist" },
];

// Appends the matching letter size (fixed age→letter rule) next to the server-
// composed age label wherever the row's range matches, e.g. "6 - 7 Years (XS)".
function displaySizeLabel(row: SizeChartRow): string {
  const alpha = alphaSizeForAgeRange(row.sizeFrom, row.sizeTo, row.sizeUnit);
  return alpha ? `${row.size} (${alpha})` : row.size;
}

interface SizeChartDialogProps {
  chart: ProductSizeChart;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Customer-facing size guide for the PDP — renders the admin-authored sizing
 * chart linked to the product. Desktop gets a compact read-only table; mobile
 * gets stacked per-size cards so it never needs a horizontal scrollbar.
 */
const SizeChartDialog = ({ chart, open, onOpenChange }: SizeChartDialogProps) => {
  const [unit, setUnit] = useState<"inches" | "centimeters">("inches");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm sm:max-w-3xl max-h-[80vh] overflow-y-auto rounded-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{chart.name}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <StockToggleSlider
            isUnlimited={unit === "centimeters"}
            onChange={(isCm) => setUnit(isCm ? "centimeters" : "inches")}
            limitedLabel="Inches"
            unlimitedLabel="Centimeters"
            limitedLabelMobile="in"
            unlimitedLabelMobile="cm"
            accentColor="#0B5B55"
            className="w-24 sm:w-44 h-9"
          />
          <p className="text-[11px] text-gray-500">
            All measurements in {unit === "inches" ? "inches" : "centimeters"}
          </p>
        </div>

        {/* Mobile: stacked per-size cards */}
        <div className="flex flex-col gap-3 sm:hidden">
          {chart.rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-gray-400 p-3">
              <p className="text-sm font-bold text-slate-900 mb-2">{displaySizeLabel(row)}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {COLUMNS.map((col) => (
                  <div key={col.key} className="flex items-center justify-between border-b border-gray-100 py-1">
                    <span className="text-xs text-gray-500">{col.label}</span>
                    <span className="text-xs font-semibold text-slate-900">{row[unit][col.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: read-only table */}
        <div className="hidden sm:block overflow-x-auto rounded-md border border-gray-400 bg-white">
          <table className="w-full text-center text-xs">
            <thead>
              <tr className="bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-600 border-b border-gray-400">
                <th className="px-3 py-2.5 whitespace-nowrap text-left">Size</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="px-3 py-2.5 whitespace-nowrap">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {chart.rows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap text-left">{displaySizeLabel(row)}</td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="px-3 py-2.5 text-gray-700 tabular-nums">{row[unit][col.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SizeChartDialog;
