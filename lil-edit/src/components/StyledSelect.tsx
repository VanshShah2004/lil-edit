import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface StyledSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

/**
 * Form dropdown built on the shared shadcn Select (same component used by the
 * Orders sort/filter dropdowns), so the popup, animations and check indicator
 * match the rest of the app. Trigger is sized for the form and turns sky-blue
 * once a value is chosen.
 */
export default function StyledSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
}: StyledSelectProps) {
  const filled = !!value;

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-auto px-5 py-4 rounded-md font-body text-base focus:ring-0 focus:ring-offset-0 focus:border-gray-900 data-[placeholder]:text-gray-500",
          filled ? "bg-sky-50 border-sky-200 text-gray-900" : "bg-gray-50 border-gray-300 text-gray-900",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-sm">
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
