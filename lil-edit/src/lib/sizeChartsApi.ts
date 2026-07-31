import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

export interface SizeChartMeasurements {
  topLength: number;
  chest: number;
  sleeve: number;
  bottomLength: number;
  waist: number;
}

export type SizeUnit = "Months" | "Years";

export interface SizeChartRow {
  // Auto-generated display label, e.g. "6 - 12 Months" — derived from
  // sizeFrom/sizeTo/sizeUnit, not independently editable.
  size: string;
  sizeFrom: number;
  sizeTo: number;
  sizeUnit: SizeUnit;
  inches: SizeChartMeasurements;
  centimeters: SizeChartMeasurements;
}

export interface SizeChart {
  id: string;
  name: string;
  rows: SizeChartRow[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSizeChartPayload {
  name: string;
  rows?: SizeChartRow[];
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[sizeChartsApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[sizeChartsApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function fetchSizeCharts(): Promise<SizeChart[]> {
  const res = await authFetch("/api/admin/size-charts");
  if (!res.ok) throw await errorFrom(res, "Could not load sizing charts");
  const data = (await res.json()) as { charts: SizeChart[] };
  return data.charts ?? [];
}

export async function createSizeChart(payload: CreateSizeChartPayload): Promise<SizeChart> {
  const res = await authFetch("/api/admin/size-charts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await errorFrom(res, "Could not create sizing chart");
  const data = (await res.json()) as { chart: SizeChart };
  return data.chart;
}

export async function updateSizeChart(id: string, payload: Partial<CreateSizeChartPayload>): Promise<SizeChart> {
  const res = await authFetch(`/api/admin/size-charts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await errorFrom(res, "Could not update sizing chart");
  const data = (await res.json()) as { chart: SizeChart };
  return data.chart;
}

export async function deleteSizeChart(id: string): Promise<void> {
  const res = await authFetch(`/api/admin/size-charts/${id}`, { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res, "Could not delete sizing chart");
}
