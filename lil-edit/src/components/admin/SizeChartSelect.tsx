import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fetchSizeCharts, type SizeChart } from "@/lib/sizeChartsApi";

interface SizeChartSelectProps {
  /** size_charts.id ("" = nothing chosen yet). */
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Sizing-chart dropdown for the Add / Edit Product forms. Loads the charts from
 * the admin size-charts API and stores the chart's id while displaying its name
 * (StyledSelect can't do that split, hence the dedicated component — same
 * trigger styling so it sits next to the other form dropdowns seamlessly).
 *
 * When no chart is selected yet, it auto-selects the default chart
 * ("Default Sizing") once the list loads, so every product gets a chart unless
 * the admin deliberately picks another one.
 */
export default function SizeChartSelect({ value, onChange, className = "" }: SizeChartSelectProps) {
  const [charts, setCharts] = useState<SizeChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSizeCharts();
        if (!cancelled) setCharts(data);
      } catch (err) {
        console.error("[SizeChartSelect] load failed:", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Default to the seeded default chart when the form has no selection yet.
  useEffect(() => {
    if (loading || value) return;
    const def = charts.find((c) => c.is_default) ?? charts[0];
    if (def) {
      console.log(`[SizeChartSelect] defaulting to "${def.name}" (${def.id})`);
      onChange(def.id);
    }
  }, [loading, value, charts, onChange]);

  // A saved id whose chart was deleted since: show placeholder, let admin re-pick.
  const known = charts.some((c) => c.id === value);
  const filled = !!value && known;

  return (
    <Select value={known ? value : undefined} onValueChange={onChange} disabled={loading || charts.length === 0}>
      <SelectTrigger
        className={cn(
          "h-auto px-5 py-4 rounded-md font-body text-base focus:ring-0 focus:ring-offset-0 focus:border-gray-900 data-[placeholder]:text-gray-500",
          filled ? "bg-sky-50 border-sky-200 text-gray-900" : "bg-gray-50 border-gray-300 text-gray-900",
          className,
        )}
      >
        <SelectValue
          placeholder={loading ? "Loading charts…" : loadError ? "Couldn't load charts" : charts.length === 0 ? "No sizing charts yet" : "Select a sizing chart"}
        />
      </SelectTrigger>
      <SelectContent>
        {charts.map((chart) => (
          <SelectItem key={chart.id} value={chart.id} className="text-sm">
            {chart.name}
            {chart.is_default ? " (Default)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
