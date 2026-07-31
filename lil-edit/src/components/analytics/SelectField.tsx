import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// A single, correct dropdown implementation shared by every <select>-backed
// filter in the analytics platform (mobile bucket picker, category filter, …).
// Native <select> so it gets the OS's own picker (best mobile UX) — appearance:
// none strips the native arrow so our own ChevronDown can sit consistently on
// top, the same way in every usage instead of each call site rolling its own.
interface SelectFieldProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  size = "md",
  fullWidth = false,
}: SelectFieldProps<T>) {
  return (
    <div className={cn("relative inline-flex", fullWidth && "flex w-full", className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          "appearance-none rounded-md border border-gray-400 bg-white text-gray-800 outline-none focus:border-gray-500",
          fullWidth && "w-full",
          size === "sm" ? "py-1.5 pl-2 pr-7 text-xs" : "py-1.5 pl-3 pr-8 text-sm font-semibold"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400",
          size === "sm" ? "right-2 h-3 w-3" : "right-2 h-3.5 w-3.5"
        )}
      />
    </div>
  );
}
