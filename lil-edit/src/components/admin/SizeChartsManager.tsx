import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronUp,
  Copy,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Ruler,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StockToggleSlider from "@/components/StockToggleSlider";
import {
  fetchSizeCharts,
  createSizeChart,
  updateSizeChart,
  deleteSizeChart,
  type SizeChart,
  type SizeChartRow,
  type SizeChartMeasurements,
  type SizeUnit,
} from "@/lib/sizeChartsApi";
import { alphaSizeForAgeRange } from "@/lib/sizeLabels";

const ACCENT = "#B19CD9";


const COLUMNS: { key: keyof SizeChartMeasurements; label: string }[] = [
  { key: "topLength", label: "Top Length" },
  { key: "chest", label: "Chest" },
  { key: "sleeve", label: "Sleeve" },
  { key: "bottomLength", label: "Bottom Length" },
  { key: "waist", label: "Waist" },
];

function composeSizeLabel(from: number, to: number, unit: SizeUnit): string {
  return `${from} - ${to} ${unit}`;
}

// Appends the matching letter size (fixed age→letter rule) next to the age
// label wherever the row's range matches, e.g. "6 - 7 Years (XS)".
function displaySizeLabel(row: SizeChartRow): string {
  const alpha = alphaSizeForAgeRange(row.sizeFrom, row.sizeTo, row.sizeUnit);
  return alpha ? `${row.sizeFrom} - ${row.sizeTo} ${row.sizeUnit} (${alpha})` : `${row.sizeFrom} - ${row.sizeTo} ${row.sizeUnit}`;
}

// Legacy/hand-edited rows may only carry the composed `size` string — parse it back
// into from/to/unit so the dropdown editor has something sensible to start from.
function parseSizeLabel(label: string): { from: number; to: number; unit: SizeUnit } {
  const match = /^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(months?|years?)\s*$/i.exec(label);
  if (!match) return { from: 0, to: 0, unit: "Months" };
  const unit: SizeUnit = /^year/i.test(match[3]) ? "Years" : "Months";
  return { from: Number(match[1]), to: Number(match[2]), unit };
}

// Backfills sizeFrom/sizeTo/sizeUnit on rows loaded before those fields existed.
function withSizeFields(row: SizeChartRow): SizeChartRow {
  if (typeof row.sizeFrom === "number" && typeof row.sizeTo === "number" && row.sizeUnit) return row;
  const parsed = parseSizeLabel(row.size);
  return { ...row, sizeFrom: parsed.from, sizeTo: parsed.to, sizeUnit: parsed.unit };
}

function blankRow(): SizeChartRow {
  return {
    size: composeSizeLabel(0, 0, "Months"),
    sizeFrom: 0,
    sizeTo: 0,
    sizeUnit: "Months",
    inches: { topLength: 0, chest: 0, sleeve: 0, bottomLength: 0, waist: 0 },
    centimeters: { topLength: 0, chest: 0, sleeve: 0, bottomLength: 0, waist: 0 },
  };
}

const SizeChartsManager = () => {
  const [charts, setCharts] = useState<SizeChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"view" | "edit">("edit");
  const [unit, setUnit] = useState<"inches" | "centimeters">("inches");
  const [draftName, setDraftName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [draftRows, setDraftRows] = useState<SizeChartRow[]>([]);
  const [savedRowsJson, setSavedRowsJson] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SizeChart | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Below the sm breakpoint, "View" opens a full-screen modal (stacked cards, no
  // fixed-width table) instead of the inline panel, so it never needs a horizontal
  // scrollbar on narrow screens.
  const [isMobile, setIsMobile] = useState(false);
  const [mobileViewChart, setMobileViewChart] = useState<SizeChart | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const cardRef = useRef<HTMLDivElement>(null);

  // Clicking anywhere outside the card collapses the open editor without saving.
  useEffect(() => {
    if (expandedId === null) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setExpandedId(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [expandedId]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchSizeCharts();
      setCharts(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load sizing charts.";
      setLoadError(msg);
      console.error("[SizeChartsManager] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const chart = await createSizeChart({ name, rows: [] });
      toast.success(`Chart "${name}" created.`);
      setNewName("");
      setShowCreateForm(false);
      await load();
      openEditor(chart);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create sizing chart.");
    } finally {
      setCreating(false);
    }
  };

  const openEditor = (chart: SizeChart) => {
    const rows = chart.rows.length ? chart.rows.map(withSizeFields) : [blankRow()];
    setExpandedId(chart.id);
    setPanelMode("edit");
    setUnit("inches");
    setDraftName(chart.name);
    setSavedName(chart.name);
    setDraftRows(rows);
    setSavedRowsJson(JSON.stringify(rows));
  };

  const toggleEditor = (chart: SizeChart) => {
    if (expandedId === chart.id && panelMode === "edit") {
      setExpandedId(null);
      return;
    }
    openEditor(chart);
  };

  const toggleViewer = (chart: SizeChart) => {
    if (isMobile) {
      setUnit("inches");
      setMobileViewChart((prev) => (prev?.id === chart.id ? null : chart));
      return;
    }
    if (expandedId === chart.id && panelMode === "view") {
      setExpandedId(null);
      return;
    }
    setExpandedId(chart.id);
    setPanelMode("view");
    setUnit("inches");
  };

  const dirty =
    expandedId !== null && panelMode === "edit" &&
    (JSON.stringify(draftRows) !== savedRowsJson || draftName.trim() !== savedName);

  const updateCell = (rowIndex: number, key: keyof SizeChartMeasurements, value: string) => {
    setDraftRows((rows) =>
      rows.map((row, i) => (i === rowIndex ? { ...row, [unit]: { ...row[unit], [key]: Number(value) || 0 } } : row))
    );
  };

  const updateSizeRange = (rowIndex: number, patch: Partial<Pick<SizeChartRow, "sizeFrom" | "sizeTo" | "sizeUnit">>) => {
    setDraftRows((rows) =>
      rows.map((row, i) => {
        if (i !== rowIndex) return row;
        const next = { ...row, ...patch };
        return { ...next, size: composeSizeLabel(next.sizeFrom, next.sizeTo, next.sizeUnit) };
      })
    );
  };

  const addRow = () => setDraftRows((rows) => [...rows, blankRow()]);
  const removeRow = (rowIndex: number) => setDraftRows((rows) => rows.filter((_, i) => i !== rowIndex));

  const convertMeasurements = (source: SizeChartMeasurements, factor: number): SizeChartMeasurements => ({
    topLength: Math.round(source.topLength * factor * 100) / 100,
    chest: Math.round(source.chest * factor * 100) / 100,
    sleeve: Math.round(source.sleeve * factor * 100) / 100,
    bottomLength: Math.round(source.bottomLength * factor * 100) / 100,
    waist: Math.round(source.waist * factor * 100) / 100,
  });

  // Fills the unit NOT currently shown from the one being viewed — inches -> cm
  // (x2.54) while viewing inches, cm -> inches (/2.54) while viewing centimeters.
  const autoFillOtherUnit = () => {
    if (unit === "inches") {
      setDraftRows((rows) => rows.map((row) => ({ ...row, centimeters: convertMeasurements(row.inches, 2.54) })));
      toast.success("Centimeters filled from inches (× 2.54).");
    } else {
      setDraftRows((rows) => rows.map((row) => ({ ...row, inches: convertMeasurements(row.centimeters, 1 / 2.54) })));
      toast.success("Inches filled from centimeters (÷ 2.54).");
    }
  };

  const handleSave = async () => {
    if (!expandedId) return;
    const name = draftName.trim();
    if (!name) {
      toast.error("Chart name is required.");
      return;
    }
    const rows = draftRows.filter((row) => row.sizeTo > 0);
    if (rows.length === 0) {
      toast.error("Add at least one row with a size range.");
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<{ name: string; rows: SizeChartRow[] }> = { rows };
      if (name !== savedName) payload.name = name;
      const updated = await updateSizeChart(expandedId, payload);
      setCharts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setDraftName(updated.name);
      setSavedName(updated.name);
      setDraftRows(updated.rows.length ? updated.rows : [blankRow()]);
      setSavedRowsJson(JSON.stringify(updated.rows));
      toast.success(`"${updated.name}" saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save sizing chart.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSizeChart(deleteTarget.id);
      toast.success(`Chart "${deleteTarget.name}" deleted.`);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete chart.");
    } finally {
      setDeleting(false);
    }
  };

  const inputClass = "w-full rounded-md border border-gray-400 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 disabled:opacity-60";
  const cellInputClass = "w-24 rounded-md border border-gray-400 px-2 py-1.5 text-xs text-center text-gray-900 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <section>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 shrink-0 flex items-center gap-2">
          <Ruler className="w-4 h-4" style={{ color: ACCENT }} />
          Sizing Chart Setup
        </h2>
        <div className="flex-1 h-px bg-gray-900" />
      </div>

      <div ref={cardRef} className="rounded-lg border border-gray-900 bg-white overflow-hidden shadow-sm md:max-w-5xl md:mx-auto">

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-gray-900">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-700">
            All charts{!loading && !loadError ? ` (${charts.length})` : ""}
          </p>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all shrink-0"
            style={{ background: "#008080" }}
          >
            <Plus className="w-3.5 h-3.5" />
            New chart
          </button>
        </div>

        {showCreateForm && (
          <div className="p-4 sm:p-5 border-b border-gray-200">
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-800 mb-1">Chart name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Infant Wear"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creating}
                  className={inputClass}
                  maxLength={80}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setShowCreateForm(false); setNewName(""); }}
                  disabled={creating}
                  className="flex-1 sm:flex-none rounded-md border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-md px-5 py-2 text-xs font-semibold text-black shadow-sm transition-all disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                >
                  {creating ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>) : "Create chart"}
                </button>
              </div>
            </form>
          </div>
        )}

        {loadError && (
          <div className="p-5 bg-red-50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-800">Couldn't load sizing charts</p>
                <p className="text-xs text-red-700 mt-1 break-words">{loadError}</p>
                <button
                  type="button"
                  onClick={() => { setLoading(true); void load(); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && !loadError && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && !loadError && charts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Ruler className="w-8 h-8 text-gray-400 mb-3" />
            <p className="text-sm font-semibold text-gray-700">No sizing charts yet</p>
            <p className="text-xs text-gray-500 mt-1">Click "New chart" to create your first sizing chart.</p>
          </div>
        )}

        {!loading && !loadError && charts.length > 0 && (
          <ul className="divide-y divide-gray-500">
            {charts.map((chart) => {
              const isViewing = isMobile
                ? mobileViewChart?.id === chart.id
                : expandedId === chart.id && panelMode === "view";
              const isEditing = expandedId === chart.id && panelMode === "edit";
              return (
                <li key={chart.id}>
                  <div
                    onClick={() => toggleViewer(chart)}
                    className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 truncate">{chart.name}</span>
                        {chart.is_default && (
                          <span className="px-1.5 py-0.5 rounded-sm bg-[#B19CD9]/15 text-[10px] font-bold uppercase tracking-wide text-[#6B5B95]">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{chart.rows.length} size{chart.rows.length === 1 ? "" : "s"}</p>
                    </div>

                    <div className="flex items-center justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleViewer(chart); }}
                        title={isViewing ? "Close" : "View chart"}
                        className="inline-flex items-center rounded-md border border-gray-400 p-2 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {isViewing ? <ChevronUp className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleEditor(chart); }}
                        title={isEditing ? "Close" : "Edit chart"}
                        className="inline-flex items-center rounded-md border border-gray-400 p-2 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {isEditing ? <ChevronUp className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
                      </button>
                      <button
                        type="button"
                        onClick={chart.is_default ? undefined : (e) => { e.stopPropagation(); setDeleteTarget(chart); }}
                        title={chart.is_default ? undefined : "Delete chart"}
                        aria-hidden={chart.is_default}
                        tabIndex={chart.is_default ? -1 : 0}
                        className={`inline-flex items-center gap-1 rounded-md border border-gray-400 px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors ${
                          chart.is_default ? "invisible pointer-events-none" : ""
                        }`}
                      >
                        <Trash2 className="w-5 h-5 text-red-500" />
                      </button>
                    </div>
                  </div>

                  {isViewing && !isMobile && (
                    <div className="px-4 sm:px-5 pb-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <StockToggleSlider
                          isUnlimited={unit === "centimeters"}
                          onChange={(isCm) => setUnit(isCm ? "centimeters" : "inches")}
                          limitedLabel="Inches"
                          unlimitedLabel="Centimeters"
                          accentColor="#0d9488"
                          className="w-44 h-9 !border-gray-400"
                        />
                      </div>

                      <div className="overflow-x-auto rounded-md border border-gray-700 sm:border-gray-400 bg-white">
                        <table className="w-full table-fixed text-center">
                          <colgroup>
                            <col style={{ width: 280 }} />
                            {COLUMNS.map((col) => (
                              <col key={col.key} style={{ width: 120 }} />
                            ))}
                          </colgroup>
                          <thead>
                            <tr className="bg-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-600 border-b border-gray-700 sm:border-gray-400">
                              <th className="px-3 py-2 whitespace-nowrap">Size</th>
                              {COLUMNS.map((col) => (
                                <th key={col.key} className="px-3 py-2 whitespace-nowrap">{col.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {chart.rows.length === 0 ? (
                              <tr>
                                <td colSpan={COLUMNS.length + 1} className="px-3 py-6 text-xs text-gray-500">
                                  No sizes added yet.
                                </td>
                              </tr>
                            ) : (
                              chart.rows.map(withSizeFields).map((row, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-2 text-xs font-semibold text-gray-800">
                                    {displaySizeLabel(row)}
                                  </td>
                                  {COLUMNS.map((col) => (
                                    <td key={col.key} className="px-3 py-2 text-xs text-gray-700">
                                      {row[unit][col.key]}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {isEditing && (
                    <div className="px-4 sm:px-5 pb-5">
                      <div className="rounded-lg border border-gray-400 bg-gray-50 p-3 sm:p-4">
                        <div className="mb-4">
                          <label className="block text-xs font-semibold text-gray-800 mb-1">Chart name</label>
                          <input
                            type="text"
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            maxLength={80}
                            className={`${inputClass} max-w-full sm:max-w-sm`}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                          <StockToggleSlider
                            isUnlimited={unit === "centimeters"}
                            onChange={(isCm) => setUnit(isCm ? "centimeters" : "inches")}
                            limitedLabel="Inches"
                            unlimitedLabel="Centimeters"
                            limitedLabelMobile="in"
                            unlimitedLabelMobile="cm"
                            accentColor="#0d9488"
                            className="w-24 sm:w-44 h-9 !border-gray-400"
                          />
                          <button
                            type="button"
                            onClick={autoFillOtherUnit}
                            title={unit === "inches" ? "Fill centimeters from inches (× 2.54)" : "Fill inches from centimeters (÷ 2.54)"}
                            className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition-colors ml-auto"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {unit === "inches" ? "Fill cm from inches" : "Fill inches from cm"}
                          </button>
                        </div>

                        {/* Mobile: stacked editable cards — no horizontal scroll */}
                        <div className="flex flex-col gap-3 sm:hidden">
                          {draftRows.map((row, i) => (
                            <div key={i} className="rounded-md border border-gray-400 bg-white p-3">
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      step="1"
                                      placeholder="From"
                                      value={row.sizeFrom}
                                      onChange={(e) => updateSizeRange(i, { sizeFrom: Number(e.target.value) || 0 })}
                                      className="w-12 rounded-md border border-gray-400 px-2 py-1.5 text-xs text-center text-gray-900 outline-none focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <span className="text-xs text-gray-400">–</span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="1"
                                      placeholder="To"
                                      value={row.sizeTo}
                                      onChange={(e) => updateSizeRange(i, { sizeTo: Number(e.target.value) || 0 })}
                                      className="w-12 rounded-md border border-gray-400 px-2 py-1.5 text-xs text-center text-gray-900 outline-none focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                  </div>
                                  <StockToggleSlider
                                    isUnlimited={row.sizeUnit === "Years"}
                                    onChange={(isYears) => updateSizeRange(i, { sizeUnit: isYears ? "Years" : "Months" })}
                                    limitedLabel="Months"
                                    unlimitedLabel="Years"
                                    accentColor={ACCENT}
                                    activeTextColor="#000000"
                                    className="w-32 h-9 shrink-0 !border-gray-400"
                                  />
                                  {alphaSizeForAgeRange(row.sizeFrom, row.sizeTo, row.sizeUnit) && (
                                    <span className="px-1.5 py-0.5 rounded-sm bg-[#B19CD9]/15 text-[10px] font-bold uppercase tracking-wide text-[#6B5B95]">
                                      {alphaSizeForAgeRange(row.sizeFrom, row.sizeTo, row.sizeUnit)}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeRow(i)}
                                  title="Delete row"
                                  className="text-red-500 hover:text-red-600 transition-colors shrink-0 mt-1"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {COLUMNS.map((col) => (
                                  <div key={col.key} className="flex flex-col gap-1">
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{col.label}</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={0}
                                      value={row[unit][col.key]}
                                      onChange={(e) => updateCell(i, col.key, e.target.value)}
                                      className="w-full rounded-md border border-gray-400 px-2 py-1.5 text-xs text-center text-gray-900 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop: table */}
                        <div className="hidden sm:block overflow-x-auto rounded-md border border-gray-400 bg-white">
                          <table className="w-full table-fixed text-center">
                            <colgroup>
                              <col style={{ width: 280 }} />
                              {COLUMNS.map((col) => (
                                <col key={col.key} style={{ width: 120 }} />
                              ))}
                              <col style={{ width: 48 }} />
                            </colgroup>
                            <thead>
                              <tr className="bg-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-600 border-b border-gray-700 sm:border-gray-400">
                                <th className="px-3 py-2 whitespace-nowrap">Size</th>
                                {COLUMNS.map((col) => (
                                  <th key={col.key} className="px-3 py-2 whitespace-nowrap">{col.label}</th>
                                ))}
                                <th className="px-3 py-2 w-8" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {draftRows.map((row, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          step="1"
                                          placeholder="From"
                                          value={row.sizeFrom}
                                          onChange={(e) => updateSizeRange(i, { sizeFrom: Number(e.target.value) || 0 })}
                                          className="w-12 rounded-md border border-gray-400 px-2 py-1.5 text-xs text-center text-gray-900 outline-none focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <span className="text-xs text-gray-400">–</span>
                                        <input
                                          type="number"
                                          min={0}
                                          step="1"
                                          placeholder="To"
                                          value={row.sizeTo}
                                          onChange={(e) => updateSizeRange(i, { sizeTo: Number(e.target.value) || 0 })}
                                          className="w-12 rounded-md border border-gray-400 px-2 py-1.5 text-xs text-center text-gray-900 outline-none focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      </div>
                                      <StockToggleSlider
                                        isUnlimited={row.sizeUnit === "Years"}
                                        onChange={(isYears) => updateSizeRange(i, { sizeUnit: isYears ? "Years" : "Months" })}
                                        limitedLabel="Months"
                                        unlimitedLabel="Years"
                                        accentColor={ACCENT}
                                        activeTextColor="#000000"
                                        className="w-32 h-9 shrink-0 !border-gray-400"
                                      />
                                      {alphaSizeForAgeRange(row.sizeFrom, row.sizeTo, row.sizeUnit) && (
                                        <span className="px-1.5 py-0.5 rounded-sm bg-[#B19CD9]/15 text-[10px] font-bold uppercase tracking-wide text-[#6B5B95]">
                                          {alphaSizeForAgeRange(row.sizeFrom, row.sizeTo, row.sizeUnit)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {COLUMNS.map((col) => (
                                    <td key={col.key} className="px-3 py-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        min={0}
                                        value={row[unit][col.key]}
                                        onChange={(e) => updateCell(i, col.key, e.target.value)}
                                        className={cellInputClass}
                                      />
                                    </td>
                                  ))}
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() => removeRow(i)}
                                      title="Delete row"
                                      className="text-red-500 hover:text-red-600 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                          <button
                            type="button"
                            onClick={addRow}
                            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add row
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={!dirty || saving}
                            className="inline-flex items-center justify-center gap-1.5 rounded-md px-5 py-2 text-xs font-semibold text-black shadow-sm transition-all disabled:opacity-50"
                            style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                          >
                            {saving ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>) : "Save changes"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[320px] rounded-lg p-6 sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sizing chart?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <span className="font-semibold">{deleteTarget?.name}</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row-reverse sm:space-x-reverse gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleting} className="bg-black text-white hover:bg-gray-800 hover:text-white mt-0">Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="bg-white text-red-600 border border-red-600 hover:bg-red-50 focus:ring-red-600"
            >
              {deleting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Deleting…
                </span>
              ) : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!mobileViewChart} onOpenChange={(open) => { if (!open) setMobileViewChart(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm max-h-[80vh] overflow-y-auto rounded-lg p-4">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              {mobileViewChart?.name}
              {mobileViewChart?.is_default && (
                <span className="px-1.5 py-0.5 rounded-sm bg-[#B19CD9]/15 text-[10px] font-bold uppercase tracking-wide text-[#6B5B95]">
                  Default
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <StockToggleSlider
            isUnlimited={unit === "centimeters"}
            onChange={(isCm) => setUnit(isCm ? "centimeters" : "inches")}
            limitedLabel="Inches"
            unlimitedLabel="Centimeters"
            limitedLabelMobile="in"
            unlimitedLabelMobile="cm"
            accentColor="#0d9488"
            className="w-24 h-9 !border-gray-400"
          />

          <div className="flex flex-col gap-3">
            {!mobileViewChart || mobileViewChart.rows.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">No sizes added yet.</p>
            ) : (
              mobileViewChart.rows.map(withSizeFields).map((row, i) => (
                <div key={i} className="rounded-lg border border-gray-400 p-3">
                  <p className="text-sm font-bold text-gray-900 mb-2">
                    {displaySizeLabel(row)}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {COLUMNS.map((col) => (
                      <div key={col.key} className="flex items-center justify-between border-b border-gray-100 py-1">
                        <span className="text-xs text-gray-500">{col.label}</span>
                        <span className="text-xs font-semibold text-gray-800">{row[unit][col.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default SizeChartsManager;
