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
  { value: "pending", label: "Pending" },
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

const triggerClass =
  "h-10 w-full sm:w-auto gap-1.5 rounded-md border-gray-200 bg-gray-50/50 px-3 text-xs font-medium text-gray-700 focus:border-gray-900 focus:ring-0";

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
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      {/* Search — updates results immediately (debounced by the page). */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by Order ID, customer name or email…"
          className="w-full h-10 pl-9 pr-4 text-sm border border-gray-200 rounded-md bg-gray-50/50 outline-none focus:border-gray-900 transition-all"
        />
      </div>

      <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-3">
        <Select value={status} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
          <SelectTrigger className={triggerClass} aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={payment} onValueChange={(v) => onPaymentChange(v as PaymentFilter)}>
          <SelectTrigger className={triggerClass} aria-label="Filter by payment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => onSortChange(v as OrderSortKey)}>
          <SelectTrigger className={triggerClass} aria-label="Sort orders">
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
