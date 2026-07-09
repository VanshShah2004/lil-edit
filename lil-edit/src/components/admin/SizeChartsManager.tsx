import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
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

const ACCENT = "#B19CD9";

const SIZE_UNITS: SizeUnit[] = ["Months", "Years"];

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

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unit, setUnit] = useState<"inches" | "centimeters">("inches");
  const [draftRows, setDraftRows] = useState<SizeChartRow[]>([]);
  const [savedRowsJson, setSavedRowsJson] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SizeChart | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setUnit("inches");
    setDraftRows(rows);
    setSavedRowsJson(JSON.stringify(rows));
  };

  const toggleEditor = (chart: SizeChart) => {
    if (expandedId === chart.id) {
      setExpandedId(null);
      return;
    }
    openEditor(chart);
  };

  const dirty = expandedId !== null && JSON.stringify(draftRows) !== savedRowsJson;

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

  const copyInchesToCm = () => {
    setDraftRows((rows) =>
      rows.map((row) => ({
        ...row,
        centimeters: {
          topLength: Math.round(row.inches.topLength * 2.54 * 100) / 100,
          chest: Math.round(row.inches.chest * 2.54 * 100) / 100,
          sleeve: Math.round(row.inches.sleeve * 2.54 * 100) / 100,
          bottomLength: Math.round(row.inches.bottomLength * 2.54 * 100) / 100,
          waist: Math.round(row.inches.waist * 2.54 * 100) / 100,
        },
      }))
    );
    toast.success("Centimeters filled from inches (× 2.54).");
  };

  const handleSaveRows = async () => {
    if (!expandedId) return;
    const rows = draftRows.filter((row) => row.sizeTo > 0);
    if (rows.length === 0) {
      toast.error("Add at least one row with a size range.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateSizeChart(expandedId, { rows });
      setCharts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setDraftRows(updated.rows.length ? updated.rows : [blankRow()]);
      setSavedRowsJson(JSON.stringify(updated.rows));
      toast.success(`"${updated.name}" saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save sizing chart.");
    } finally {
      setSaving(false);
    }
  };

  const startRename = (chart: SizeChart) => {
    setRenameTarget(chart.id);
    setRenameValue(chart.name);
  };

  const confirmRename = async (e: FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenaming(true);
    try {
      const updated = await updateSizeChart(renameTarget, { name });
      setCharts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`Renamed to "${name}".`);
      setRenameTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename chart.");
    } finally {
      setRenaming(false);
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
  const cellInputClass = "w-24 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <section>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 shrink-0 flex items-center gap-2">
          <Ruler className="w-4 h-4" style={{ color: ACCENT }} />
          Sizing Chart Setup
        </h2>
        <div className="flex-1 h-px bg-gray-900" />
      </div>

      <div className="rounded-lg border border-gray-900 bg-white overflow-hidden shadow-sm">

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-700">
            All charts{!loading && !loadError ? ` (${charts.length})` : ""}
          </p>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all shrink-0"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
          >
            <Plus className="w-3.5 h-3.5" />
            New chart
          </button>
        </div>

        {showCreateForm && (
          <div className="p-5 border-b border-gray-200">
            <form onSubmit={handleCreate} className="flex items-end gap-3">
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
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setNewName(""); }}
                disabled={creating}
                className="rounded-md border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
              >
                {creating ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>) : "Create chart"}
              </button>
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
          <ul className="divide-y divide-gray-400">
            {charts.map((chart) => {
              const isExpanded = expandedId === chart.id;
              const isRenaming = renameTarget === chart.id;
              return (
                <li key={chart.id}>
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <form onSubmit={confirmRename} className="flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            disabled={renaming}
                            maxLength={80}
                            className="rounded-md border border-gray-400 px-2 py-1 text-sm text-gray-900 outline-none focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30"
                          />
                          <button type="submit" disabled={renaming} className="text-xs font-semibold" style={{ color: ACCENT }}>
                            {renaming ? "Saving…" : "Save"}
                          </button>
                          <button type="button" onClick={() => setRenameTarget(null)} disabled={renaming} className="text-xs font-semibold text-gray-500">
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{chart.name}</span>
                          {chart.is_default && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[#B19CD9]/15 text-[10px] font-bold uppercase tracking-wide text-[#6B5B95]">
                              Default
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-600 mt-1">{chart.rows.length} size{chart.rows.length === 1 ? "" : "s"}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startRename(chart)}
                        title="Rename chart"
                        className="inline-flex items-center rounded-md border border-gray-400 p-1.5 text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEditor(chart)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {isExpanded ? (<>Close <ChevronUp className="w-3.5 h-3.5" /></>) : (<>Edit rows <ChevronDown className="w-3.5 h-3.5" /></>)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(chart)}
                        title="Delete chart"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-400 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-5">
                      <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                          <div className="inline-flex rounded-md border border-gray-400 overflow-hidden">
                            {(["inches", "centimeters"] as const).map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => setUnit(u)}
                                className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                                  unit === u ? "text-white" : "text-gray-700 hover:bg-gray-100"
                                }`}
                                style={unit === u ? { background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` } : undefined}
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={copyInchesToCm}
                            title="Fill centimeters from inches (× 2.54)"
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" /> Fill cm from inches
                          </button>
                        </div>

                        <div className="overflow-x-auto rounded-md border border-gray-300 bg-white">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-600">
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
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={0}
                                        step="1"
                                        placeholder="From"
                                        value={row.sizeFrom}
                                        onChange={(e) => updateSizeRange(i, { sizeFrom: Number(e.target.value) || 0 })}
                                        className="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                      <span className="text-xs text-gray-500">-</span>
                                      <input
                                        type="number"
                                        min={0}
                                        step="1"
                                        placeholder="To"
                                        value={row.sizeTo}
                                        onChange={(e) => updateSizeRange(i, { sizeTo: Number(e.target.value) || 0 })}
                                        className="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                      <select
                                        value={row.sizeUnit}
                                        onChange={(e) => updateSizeRange(i, { sizeUnit: e.target.value as SizeUnit })}
                                        className="rounded-md border border-gray-300 px-1.5 py-1.5 text-xs text-gray-900 outline-none focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30"
                                      >
                                        {SIZE_UNITS.map((u) => (
                                          <option key={u} value={u}>{u}</option>
                                        ))}
                                      </select>
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
                                      title="Remove row"
                                      className="text-gray-400 hover:text-red-600 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex items-center justify-between gap-3 mt-4">
                          <button
                            type="button"
                            onClick={addRow}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add row
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveRows()}
                            disabled={!dirty || saving}
                            className="inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
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
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm p-4 sm:max-w-lg sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sizing chart?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <span className="font-semibold">{deleteTarget?.name}</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
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
    </section>
  );
};

export default SizeChartsManager;
