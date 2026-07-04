import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as RMouseEvent,
  type ReactNode,
  type TouchEvent as RTouchEvent,
} from "react";
import { Check, Minus, Plus, SlidersHorizontal, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardLayout } from "@/lib/dashboardLayoutApi";

// ─── Dashboard customisation — iPhone-style hide/show for analytics cards ──────
// Every metric / chart / table is a "rectangle". Long-press (mobile) or right-click
// (desktop) enters a jiggle "edit mode" where each visible card shows a − badge to
// hide it; hidden cards collect in a tray with a + to restore them. Visibility is
// GLOBAL — shared by all admins — and lives in the DB via useDashboardLayout.
//
// The hide behaviour is baked into the card primitives through useHideable(), so a
// page opts in simply by passing a `customizeKey` to AnalyticsLayout (which wraps it
// in a CustomizeProvider). Off a provider — or on a page that didn't opt in — every
// hook is an inert no-op and the cards render exactly as before.

const ACCENT = "#0F766E";
const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

// ─── Context ──────────────────────────────────────────────────────────────────
interface WidgetMeta {
  id: string;
  label: string;
}
interface MenuState {
  x: number;
  y: number;
  id: string;
  label: string;
}
interface CustomizeContextValue {
  enabled: boolean;
  editing: boolean;
  enterEdit: () => void;
  exitEdit: () => void;
  isHidden: (id: string) => boolean;
  hide: (id: string) => void;
  show: (id: string) => void;
  register: (id: string, label: string) => void;
  unregister: (id: string) => void;
  hiddenWidgets: WidgetMeta[];
  registeredCount: number;
  visibleCount: number;
  menu: MenuState | null;
  openMenu: (x: number, y: number, id: string, label: string) => void;
  closeMenu: () => void;
}

const noop = () => {};
const DEFAULT: CustomizeContextValue = {
  enabled: false,
  editing: false,
  enterEdit: noop,
  exitEdit: noop,
  isHidden: () => false,
  hide: noop,
  show: noop,
  register: noop,
  unregister: noop,
  hiddenWidgets: [],
  registeredCount: 0,
  visibleCount: 0,
  menu: null,
  openMenu: noop,
  closeMenu: noop,
};

const CustomizeContext = createContext<CustomizeContextValue>(DEFAULT);

export function useCustomize(): CustomizeContextValue {
  return useContext(CustomizeContext);
}

/** Stable slug for a card, derived from its human label/title. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function CustomizeProvider({ pageKey, children }: { pageKey?: string; children: ReactNode }) {
  const enabled = !!pageKey && pageKey.trim().length > 0;
  const { hidden, hide, show } = useDashboardLayout(pageKey ?? "");

  const [editing, setEditing] = useState(false);
  const [registry, setRegistry] = useState<Map<string, string>>(() => new Map());
  const [menu, setMenu] = useState<MenuState | null>(null);

  const register = useCallback((id: string, label: string) => {
    setRegistry((prev) => {
      if (prev.get(id) === label) return prev;
      const next = new Map(prev);
      next.set(id, label);
      return next;
    });
  }, []);
  const unregister = useCallback((id: string) => {
    setRegistry((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const enterEdit = useCallback(() => setEditing(true), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const exitEdit = useCallback(() => {
    setEditing(false);
    setMenu(null);
  }, []);
  const openMenu = useCallback((x: number, y: number, id: string, label: string) => setMenu({ x, y, id, label }), []);

  const isHidden = useCallback((id: string) => hidden.has(id), [hidden]);

  // Tray items + counts, from the widgets that mounted this page ∩ the hidden set.
  const hiddenWidgets = useMemo(() => {
    const items: WidgetMeta[] = [];
    registry.forEach((label, id) => {
      if (hidden.has(id)) items.push({ id, label });
    });
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
  }, [registry, hidden]);
  const registeredCount = registry.size;
  const visibleCount = registeredCount - hiddenWidgets.length;

  const value = useMemo<CustomizeContextValue>(
    () => ({
      enabled,
      editing: enabled && editing,
      enterEdit,
      exitEdit,
      isHidden,
      hide: enabled ? hide : noop,
      show: enabled ? show : noop,
      register,
      unregister,
      hiddenWidgets,
      registeredCount,
      visibleCount,
      menu,
      openMenu,
      closeMenu,
    }),
    [enabled, editing, enterEdit, exitEdit, isHidden, hide, show, register, unregister, hiddenWidgets, registeredCount, visibleCount, menu, openMenu, closeMenu],
  );

  return <CustomizeContext.Provider value={value}>{children}</CustomizeContext.Provider>;
}

// ─── Long-press detection (mobile) ────────────────────────────────────────────
// A held touch (~500ms, without moving/scrolling) fires onLongPress. We never
// preventDefault (React's touch listeners are passive) — instead the card goes
// inert in edit mode, so the trailing tap can't navigate.
type TouchHandlers = {
  onTouchStart?: (e: RTouchEvent) => void;
  onTouchMove?: (e: RTouchEvent) => void;
  onTouchEnd?: (e: RTouchEvent) => void;
  onTouchCancel?: (e: RTouchEvent) => void;
};

function useLongPress(onLongPress: () => void, active: boolean): TouchHandlers {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => () => clear(), [clear]);

  if (!active) return {};

  return {
    onTouchStart: (e) => {
      if (e.touches.length !== 1) {
        clear();
        return;
      }
      const t = e.touches[0];
      origin.current = { x: t.clientX, y: t.clientY };
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        origin.current = null;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onTouchMove: (e) => {
      if (!origin.current || e.touches.length !== 1) {
        clear();
        return;
      }
      const t = e.touches[0];
      if (Math.abs(t.clientX - origin.current.x) > MOVE_CANCEL_PX || Math.abs(t.clientY - origin.current.y) > MOVE_CANCEL_PX) {
        clear();
      }
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
  };
}

// ─── useHideable — baked into card primitives ─────────────────────────────────
export interface HideableProps {
  onContextMenu?: (e: RMouseEvent) => void;
  style?: CSSProperties;
}
export interface HideableOptions {
  /** Copied onto the in-place placeholder so it keeps the card's grid footprint (e.g. a col-span). */
  placeholderClassName?: string;
  /** Fallback min-height for the placeholder — a solo hidden card has no visible
   *  sibling to stretch against. Defaults to a KPI-card height. */
  placeholderMinH?: string;
}
export interface Hideable {
  /** True when this page's customization is active. */
  enabled: boolean;
  /** True when this specific card is hidden. The primitive should `return placeholder`
   *  (the in-place dashed "bring back" slot while editing, else null → nothing). */
  hidden: boolean;
  /** True in edit mode → the primitive should render inert (no navigation). */
  editing: boolean;
  /** Spread onto the card's ROOT element (event handlers + jiggle delay/no-select). */
  handlers: HideableProps & TouchHandlers;
  /** Merge into the root className (adds `relative dash-jiggle` in edit mode). */
  jiggleClass: string;
  /** The − remove badge; render inside the root. null unless editing. */
  badge: ReactNode;
  /** What to render when `hidden`: a dashed grey "+" slot in the card's own place
   *  (edit mode), or null when not editing (card is fully gone). */
  placeholder: ReactNode;
}

export function useHideable(id: string, label: string, opts?: HideableOptions): Hideable {
  const ctx = useCustomize();
  const { enabled, editing, register, unregister, openMenu, enterEdit, hide, show, isHidden } = ctx;

  useEffect(() => {
    if (!enabled) return;
    register(id, label);
    return () => unregister(id);
  }, [enabled, id, label, register, unregister]);

  // A stable, per-card negative delay desyncs the jiggle so cards don't wobble in
  // lockstep (the iOS look).
  const delayRef = useRef<number>(-(Math.random() * 0.6));

  const longPress = useLongPress(enterEdit, enabled && !editing);
  const hidden = enabled && isHidden(id);

  if (!enabled) {
    return { enabled: false, hidden: false, editing: false, handlers: {}, jiggleClass: "", badge: null, placeholder: null };
  }

  const style: CSSProperties = {
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    ...(editing ? { animationDelay: `${delayRef.current}s` } : {}),
  } as CSSProperties;

  const handlers: HideableProps & TouchHandlers = {
    onContextMenu: (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, id, label);
    },
    ...longPress,
    style,
  };

  // A hidden card leaves an in-place dashed "+" slot WHILE EDITING, so it can be
  // brought back exactly where it lived. Not editing → it renders nothing at all.
  const placeholder =
    hidden && editing ? (
      <HiddenPlaceholder
        label={label}
        onShow={() => show(id)}
        className={opts?.placeholderClassName}
        minH={opts?.placeholderMinH}
      />
    ) : null;

  return {
    enabled: true,
    hidden,
    editing,
    handlers,
    jiggleClass: editing ? "relative dash-jiggle" : "",
    badge: editing ? <HideBadge label={label} onClick={() => hide(id)} /> : null,
    placeholder,
  };
}

function HideBadge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Hide ${label}`}
      title={`Hide ${label}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-md transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
    >
      <Minus className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}

// The in-place "bring back" slot shown where a hidden card used to sit, WHILE
// editing. A dashed grey rectangle with a + — click anywhere on it to restore the
// card. It stretches (h-full) to match its visible siblings in the same grid row,
// falling back to `minH` when the whole row is hidden.
function HiddenPlaceholder({
  label,
  onShow,
  className,
  minH,
}: {
  label: string;
  onShow: () => void;
  className?: string;
  minH?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Bring back ${label}`}
      title={`Bring back ${label}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onShow();
      }}
      className={cn(
        "group flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-100 p-4 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50",
        minH ?? "min-h-[104px]",
        className,
      )}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white group-hover:border-emerald-400"
        style={{ color: ACCENT }}
      >
        <Plus className="h-4 w-4" strokeWidth={3} />
      </span>
      <span className="line-clamp-2 text-xs font-medium text-gray-500">{label}</span>
    </button>
  );
}

// ─── Generic wrapper for non-grid, full-width one-offs (e.g. the Insights block) ─
export function Widget({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  const { hidden, placeholder, handlers, jiggleClass, badge } = useHideable(id, label, {
    placeholderClassName: className,
    placeholderMinH: "min-h-[140px]",
  });
  if (hidden) return placeholder;
  return (
    <div {...handlers} className={cn(className, jiggleClass)}>
      {children}
      {badge}
    </div>
  );
}

// ─── Header affordance — a discoverable way in besides long-press/right-click ──
export function CustomiseButton() {
  const { enabled, editing, enterEdit } = useCustomize();
  if (!enabled || editing) return null;
  return (
    <button
      type="button"
      onClick={enterEdit}
      title="Customise dashboard — hide or restore cards"
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-400 bg-white px-2.5 text-xs font-semibold text-gray-600 hover:border-gray-500 hover:text-gray-800"
    >
      <SlidersHorizontal className="h-4 w-4" />
      <span className="hidden sm:inline">Customise</span>
    </button>
  );
}

// ─── Shown after the page's children when EVERY card is hidden (not editing) ───
export function CustomizeEmptyState() {
  const { enabled, editing, registeredCount, visibleCount, enterEdit } = useCustomize();
  if (!enabled || editing || registeredCount === 0 || visibleCount > 0) return null;
  return (
    <div className="rounded-xl border border-dashed border-gray-400 bg-white p-10 text-center">
      <p className="text-sm text-gray-500">Every card on this page is hidden.</p>
      <button
        type="button"
        onClick={enterEdit}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-500"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Customise to bring cards back
      </button>
    </div>
  );
}

// ─── Fixed chrome — the right-click menu + the Done bar ───────────────────────
export function EditModeChrome() {
  const { enabled, editing, exitEdit, enterEdit, menu, closeMenu, hide } = useCustomize();

  // Escape closes the menu first, otherwise exits edit mode.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) closeMenu();
      else if (editing) exitEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, menu, editing, closeMenu, exitEdit]);

  // Any outside interaction dismisses the menu.
  useEffect(() => {
    if (!menu) return;
    const close = () => closeMenu();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [menu, closeMenu]);

  if (!enabled) return null;

  return (
    <>
      {menu && (
        <div
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: Math.min(menu.x, window.innerWidth - 210),
            top: Math.min(menu.y, window.innerHeight - 130),
            zIndex: 60,
          }}
          className="min-w-[200px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
        >
          <MenuItem
            icon={EyeOff}
            onClick={() => {
              hide(menu.id);
              closeMenu();
            }}
          >
            Hide this card
          </MenuItem>
          {editing ? (
            <MenuItem
              icon={Check}
              onClick={() => {
                exitEdit();
                closeMenu();
              }}
            >
              Done customising
            </MenuItem>
          ) : (
            <MenuItem
              icon={SlidersHorizontal}
              onClick={() => {
                enterEdit();
                closeMenu();
              }}
            >
              Customise dashboard
            </MenuItem>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-gray-300 bg-white/95 px-4 py-2 shadow-xl backdrop-blur">
            <span className="hidden text-xs text-gray-500 sm:inline">
              Tap <span className="font-semibold">−</span> to hide, <span className="font-semibold">+</span> to bring back
            </span>
            <button
              type="button"
              onClick={exitEdit}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              <Check className="h-4 w-4" />
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({ icon: Icon, onClick, children }: { icon: typeof EyeOff; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
    >
      <Icon className="h-4 w-4 text-gray-400" />
      {children}
    </button>
  );
}
