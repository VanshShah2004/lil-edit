import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();

  // On mobile, drop toasts from the top but sit them just below the fixed navbar
  // + mega menu. --navbar-height is published by UserNavbar and already includes
  // the mega menu bar; the fallback covers the brief moment before it's measured
  // (or pages without the navbar). We set both offset and mobileOffset because
  // our useIsMobile breakpoint (768px) is wider than Sonner's internal mobile
  // cutoff (600px), so the 600–767px range needs the desktop `offset` too.
  const mobileTopInset = { top: "calc(var(--navbar-height, 6rem) + 12px)" };

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      // Toasts surface from the top on mobile (where bottom placement is easy to
      // miss) and stay bottom-right on desktop.
      position={isMobile ? "top-center" : "bottom-right"}
      offset={isMobile ? mobileTopInset : undefined}
      mobileOffset={isMobile ? mobileTopInset : undefined}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          error: "group-[.toaster]:!bg-red-600 group-[.toaster]:!text-white group-[.toaster]:!border-red-700",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
