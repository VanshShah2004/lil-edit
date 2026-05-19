/** Above-the-fold PDP skeleton — mirrors ProductPreviewView layout for instant perceived load. */

function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-gray-200/80 animate-pulse ${className}`} aria-hidden />;
}

export default function ProductDetailSkeleton() {
  return (
    <div className="page-container w-full pb-6" aria-busy="true" aria-label="Loading product">
      <div className="md:hidden pt-1 pb-4 space-y-2">
        <Bone className="h-3 w-24" />
        <Bone className="h-7 w-4/5 max-w-md" />
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-8 lg:gap-12">
        <div className="w-full md:w-[55%] flex flex-col md:flex-row gap-4">
          <div className="order-2 md:order-1 flex md:flex-col gap-3 overflow-x-auto md:overflow-visible no-scrollbar shrink-0">
            {[1, 2, 3, 4].map((i) => (
              <Bone key={i} className="w-16 md:w-20 aspect-[4/5] rounded-xl shrink-0" />
            ))}
          </div>
          <Bone className="order-1 md:order-2 flex-1 w-full aspect-[4/5] rounded-2xl" />
        </div>

        <div className="w-full md:w-[45%] space-y-5">
          <div className="hidden md:block space-y-2">
            <Bone className="h-3 w-28" />
            <Bone className="h-8 w-full max-w-lg" />
          </div>

          <div className="flex items-center gap-3">
            <Bone className="h-8 w-28" />
            <Bone className="h-5 w-20" />
            <Bone className="h-6 w-16 ml-auto rounded-full" />
          </div>

          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <Bone key={i} className="h-6 w-16 rounded-md" />
            ))}
          </div>

          <div className="flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Bone key={i} className="h-5 w-5 rounded-full" />
            ))}
          </div>

          <div className="space-y-3">
            <Bone className="h-4 w-20" />
            <div className="flex gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Bone key={i} className="h-10 w-10 rounded-full" />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Bone className="h-4 w-12" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Bone key={i} className="h-8 w-12 rounded-lg" />
              ))}
            </div>
          </div>

          <Bone className="h-10 w-36 rounded-full" />

          <div className="flex flex-col gap-3 pt-2">
            <Bone className="h-12 w-full rounded-full" />
            <Bone className="h-12 w-full rounded-full" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <Bone key={i} className="h-16 rounded-xl" />
            ))}
          </div>

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
