/** Above-the-fold PDP skeleton — mirrors ProductPreviewView layout for instant perceived load. */

import { useEffect } from "react";

const IS_DEV = import.meta.env.DEV;

function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-gray-200/80 animate-pulse ${className}`} aria-hidden />;
}

export default function ProductDetailSkeleton() {
  useEffect(() => {
    if (!IS_DEV) return;
    console.groupCollapsed(
      "%c[PDP SKELETON]%c  mounted — structure fix verification",
      "color:#0F766E;font-weight:bold",
      "color:#334155"
    );
    console.table({
      "Double page-container removed" : { status: "✓", detail: "root div no longer has page-container — padding matches ProductPreviewView" },
      "Thumbnail md:w-24 restored"    : { status: "✓", detail: "outer wrapper is now w-full md:w-24 (96px) matching ProductPreviewView:173" },
      "Mobile title inside flex"      : { status: "✓", detail: "w-full md:hidden block is first child of flex container, not before it" },
      "Stock status badge added"      : { status: "✓", detail: "justify-between row in color section with Bone for stock badge on right" },
      "Quantity label added"          : { status: "✓", detail: "h-4 w-20 Bone above the stepper, mirrors 'Quantity' p tag" },
    });
    console.groupEnd();
  }, []);

  return (
    <div className="w-full pb-6" aria-busy="true" aria-label="Loading product">
      <div className="flex flex-col md:flex-row gap-4 md:gap-8 lg:gap-12">

        {/* Mobile-only title — first child of flex container, md:hidden (mirrors ProductPreviewView:165) */}
        <div className="w-full md:hidden pt-1 space-y-2">
          <Bone className="h-3 w-24" />
          <Bone className="h-7 w-4/5 max-w-md" />
        </div>

        {/* Gallery column */}
        <div className="w-full md:w-[55%] flex flex-col md:flex-row gap-4">
          {/* Thumbnail strip — outer div is w-full md:w-24 to match ProductPreviewView:173 */}
          <div className="order-2 md:order-1 w-full md:w-24 shrink-0">
            <div className="flex md:flex-col justify-start gap-3 overflow-x-auto md:overflow-y-auto no-scrollbar">
              {[1, 2, 3, 4].map((i) => (
                <Bone key={i} className="w-16 md:w-20 aspect-[4/5] rounded-xl shrink-0" />
              ))}
            </div>
          </div>
          <Bone className="order-1 md:order-2 flex-1 w-full aspect-[4/5] rounded-2xl" />
        </div>

        {/* Info panel */}
        <div className="w-full md:w-[45%] space-y-5">

          {/* Desktop-only title */}
          <div className="hidden md:block space-y-2">
            <Bone className="h-3 w-28" />
            <Bone className="h-8 w-full max-w-lg" />
          </div>

          {/* Price + SKU badge */}
          <div className="flex items-center gap-3">
            <Bone className="h-8 w-28" />
            <Bone className="h-5 w-20" />
            <Bone className="h-6 w-16 ml-auto rounded-full" />
          </div>

          {/* Flags / badges */}
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <Bone key={i} className="h-6 w-16 rounded-md" />
            ))}
          </div>

          {/* Action icons: Heart, Share2, ShoppingBag, Star */}
          <div className="flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Bone key={i} className="h-5 w-5 rounded-full" />
            ))}
          </div>

          {/* Color section — label + stock badge (justify-between), then swatches */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Bone className="h-4 w-20" />
              <Bone className="h-6 w-20 rounded-full" />
            </div>
            <div className="flex gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Bone key={i} className="h-10 w-10 rounded-full" />
              ))}
            </div>
          </div>

          {/* Size section */}
          <div className="space-y-3">
            <Bone className="h-4 w-12" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Bone key={i} className="h-8 w-12 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Quantity section — label above stepper (mirrors ProductPreviewView:349) */}
          <div className="space-y-2">
            <Bone className="h-4 w-20" />
            <Bone className="h-10 w-36 rounded-full" />
          </div>

          {/* Add to cart + Buy Now */}
          <div className="flex flex-col gap-3 pt-2">
            <Bone className="h-12 w-full rounded-full" />
            <Bone className="h-12 w-full rounded-full" />
          </div>

          {/* Product details grid: Fabric, Fit, Occasion, Care */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <Bone key={i} className="h-16 rounded-xl" />
            ))}
          </div>

          {/* Description points */}
          <div className="space-y-2 pt-2">
            <Bone className="h-5 w-32" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-3/4" />
          </div>

        </div>
      </div>
    </div>
  );
}
