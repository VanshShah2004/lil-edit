import { AlertTriangle, Clock, ShoppingBag, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Why a dialog and not a toast: a payment that didn't complete is the one moment in
// checkout where the customer MUST read the message — a toast auto-dismisses and is
// routinely missed, and a customer who misses "your payment failed" retries blind, or
// worse, a customer who misses "we couldn't confirm your payment" pays a second time.
export type PaymentIssueKind =
  // Customer closed the Razorpay modal before finishing. Nothing was charged.
  | "cancelled"
  // Razorpay's `payment.failed` event — declined card, wrong OTP, bank rejection.
  // Nothing was captured.
  | "failed"
  // The payment may have SUCCEEDED but /verify didn't confirm it. This is the only
  // branch where money may have moved, so it never invites a retry (see below).
  | "unverified";

interface PaymentIssueDialogProps {
  kind: PaymentIssueKind | null; // null = closed
  /** Razorpay's customer-facing `error.description`, or the verify error message. */
  detail?: string | undefined;
  onClose: () => void;
  onRetry: () => void;
}

const COPY: Record<
  PaymentIssueKind,
  { title: string; body: string; tone: "neutral" | "danger" | "warn"; icon: typeof XCircle }
> = {
  cancelled: {
    title: "Payment cancelled",
    body: "You closed the payment window before it finished. Nothing was charged and your bag is exactly as you left it.",
    tone: "neutral",
    icon: XCircle,
  },
  failed: {
    title: "Payment didn't go through",
    body: "Your bank didn't complete this payment, so nothing was charged. You can try again with the same method or pick a different one.",
    tone: "danger",
    icon: AlertTriangle,
  },
  unverified: {
    title: "We couldn't confirm your payment",
    body: "If your money was taken, your order will appear automatically within a few minutes — please check Orders before trying again, so you're not charged twice.",
    tone: "warn",
    icon: Clock,
  },
};

const TONE = {
  neutral: { ring: "bg-gray-100", icon: "text-gray-500" },
  danger: { ring: "bg-rose-50", icon: "text-rose-500" },
  warn: { ring: "bg-amber-50", icon: "text-amber-500" },
} as const;

export default function PaymentIssueDialog({
  kind,
  detail,
  onClose,
  onRetry,
}: PaymentIssueDialogProps) {
  const navigate = useNavigate();
  if (!kind) return null;

  const { title, body, tone, icon: Icon } = COPY[kind];
  const toneClasses = TONE[tone];

  // Deliberately no "Try again" on the unverified branch. That branch means a payment
  // may have been captured without an order being confirmed to the browser; the webhook
  // backstop resolves it server-side within moments. Offering a retry there invites a
  // SECOND charge for the same bag — and there is no refund flow to unwind one.
  const canRetry = kind !== "unverified";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
        <div className="px-6 pt-8 pb-6 text-center">
          <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${toneClasses.ring}`}>
            <Icon size={30} className={toneClasses.icon} strokeWidth={1.8} />
          </div>

          <DialogHeader className="space-y-2.5">
            <DialogTitle className="text-xl font-semibold tracking-tight text-gray-900">
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-gray-600">
              {body}
            </DialogDescription>
          </DialogHeader>

          {/* Razorpay's own wording for WHY it failed — more specific than anything we
              can infer, so show it verbatim rather than paraphrasing it away. */}
          {detail && (
            <p className="mt-4 rounded-lg bg-gray-50 px-3.5 py-2.5 text-xs leading-relaxed text-gray-600">
              {detail}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-100 bg-[#FAF9F7] px-6 py-4">
          {canRetry ? (
            <>
              <Button
                onClick={() => { console.log(`[PaymentIssue] retry from "${kind}"`); onClose(); onRetry(); }}
                className="w-full rounded-xl bg-brand-teal py-5 text-sm font-semibold text-white hover:opacity-90"
              >
                Try payment again
              </Button>
              <Button
                variant="ghost"
                onClick={() => { console.log(`[PaymentIssue] to bag from "${kind}"`); onClose(); navigate("/cart"); }}
                className="w-full rounded-xl py-5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                <ShoppingBag size={15} className="mr-1.5" />
                Back to bag
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => { console.log("[PaymentIssue] to orders from \"unverified\""); onClose(); navigate("/orders"); }}
                className="w-full rounded-xl bg-brand-teal py-5 text-sm font-semibold text-white hover:opacity-90"
              >
                Check my orders
              </Button>
              <Button
                variant="ghost"
                onClick={() => { console.log("[PaymentIssue] dismissed \"unverified\""); onClose(); }}
                className="w-full rounded-xl py-5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Close
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
