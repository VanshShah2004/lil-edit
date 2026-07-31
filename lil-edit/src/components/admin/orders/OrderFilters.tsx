import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderStatus, PaymentStatus, OrderSortKey } from "@/lib/adminOrdersApi";

export type StatusFilter = OrderStatus | "all";
export type PaymentFilter = PaymentStatus | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Orders" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_OPTIONS: { value: PaymentFilter; label: string }[] = [
  { value: "all", label: "All Payments" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Unpaid" },
];

const SORT_OPTIONS: { value: OrderSortKey; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "highest", label: "Highest Value" },
  { value: "lowest", label: "Lowest Value" },
];

interface OrderFiltersProps {
  search: string;
  status: StatusFilter;
  payment: PaymentFilter;
  sort: OrderSortKey;
  onSearchChange: (v: string) => void;
  onStatusChange: (v: StatusFilter) => void;
  onPaymentChange: (v: PaymentFilter) => void;
  onSortChange: (v: OrderSortKey) => void;
}

const baseTriggerClass =
  "h-10 w-full min-w-0 justify-center sm:justify-between sm:w-auto gap-0.5 sm:gap-1.5 rounded-md px-1 sm:px-3 text-[11px] sm:text-xs font-medium focus:ring-0 transition-all [&>span]:whitespace-nowrap [&>svg]:h-3 [&>svg]:w-3 sm:[&>svg]:h-4 sm:[&>svg]:w-4";

const baseTriggerStyle = { borderWidth: "1.25px", borderColor: "#9ca3af", focusBorderColor: "#111827" };

const getStatusTriggerClass = (isActive: boolean) =>
  isActive
    ? `${baseTriggerClass} bg-purple-100 text-gray-700`
    : `${baseTriggerClass} bg-gray-50/50 text-gray-700`;

const getStatusTriggerStyle = (isActive: boolean) => ({
  ...baseTriggerStyle,
  borderColor: isActive ? "#9ca3af" : "#9ca3af",
});

const getPaymentTriggerClass = (isActive: boolean) =>
  isActive
    ? `${baseTriggerClass} bg-purple-100 text-gray-700`
    : `${baseTriggerClass} bg-gray-50/50 text-gray-700`;

const getPaymentTriggerStyle = (isActive: boolean) => ({
  ...baseTriggerStyle,
  borderColor: isActive ? "#9ca3af" : "#9ca3af",
});

export function OrderFilters({
  search,
  status,
  payment,
  sort,
  onSearchChange,
  onStatusChange,
  onPaymentChange,
  onSortChange,
}: OrderFiltersProps) {
  const statusIsActive = status !== "all";
  const paymentIsActive = payment !== "all";

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      {/* Search — updates results immediately (debounced by the page). */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by Order ID, customer name or email…"
          className="w-full h-10 pl-9 pr-4 text-sm border border-gray-400 rounded-md bg-gray-50/50 outline-none focus:border-gray-900 transition-all"
          style={{ borderWidth: "1.25px" }}
        />
      </div>

      <div className="grid grid-cols-3 items-center gap-1 sm:flex sm:gap-3">
        <Select value={status} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
          <SelectTrigger className={getStatusTriggerClass(statusIsActive)} style={getStatusTriggerStyle(statusIsActive)} aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={payment} onValueChange={(v) => onPaymentChange(v as PaymentFilter)}>
          <SelectTrigger className={getPaymentTriggerClass(paymentIsActive)} style={getPaymentTriggerStyle(paymentIsActive)} aria-label="Filter by payment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => onSortChange(v as OrderSortKey)}>
          <SelectTrigger className={baseTriggerClass + " bg-gray-50/50 text-gray-700"} style={baseTriggerStyle} aria-label="Sort orders">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default OrderFilters;
