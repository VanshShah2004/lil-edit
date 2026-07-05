import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
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
const DRAG_THRESHOLD_PX = 6; // pointer travel before a press becomes a reorder drag
const DRAG_LIFT = "scale(1.045)"; // the picked-up card's slight enlargement, iOS-style

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  // Saved per-section card order (shared, DB-backed) + the mutation to persist a
  // new arrangement. Consumed by <ReorderGroup> / useReorder for drag-to-rearrange.
  orderFor: (groupKey: string) => string[];
  reorder: (groupKey: string, orderedIds: string[]) => void;
}

const noop = () => {};
const emptyIds: string[] = [];
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
  orderFor: () => emptyIds,
  reorder: noop,
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
  const { hidden, hide, show, order, reorder } = useDashboardLayout(pageKey ?? "");

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
  const orderFor = useCallback((groupKey: string) => order[groupKey] ?? emptyIds, [order]);

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
      orderFor,
      reorder: enabled ? reorder : noop,
    }),
    [enabled, editing, enterEdit, exitEdit, isHidden, hide, show, register, unregister, hiddenWidgets, registeredCount, visibleCount, menu, openMenu, closeMenu, orderFor, reorder],
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

// ─── Reorder — drag-to-rearrange cards within a section ───────────────────────
// A page wraps a section's grid in <ReorderGroup groupKey="…">; every card inside
// (via useHideable → useReorder) becomes draggable in edit mode. Rearranging is
// done with CSS `order` on the grid items — no DOM reshuffling — so it composes
// with the hide/placeholder logic on the very same element. The chosen order is
// GLOBAL and DB-backed (CustomizeContext.reorder). Off a group, every hook is inert.
//
// Motion model (the iOS feel): the picked-up card LIFTS (scale + shadow, jiggle
// off) and follows the pointer 1:1 via an imperative inline transform; when it
// crosses a sibling the order flips and the siblings FLIP-glide (WAAPI) into
// their new slots while the held card stays glued to the finger; on release it
// settles from the finger into its final slot. Reduced-motion skips the glides.
interface ReorderContextValue {
  enabled: boolean;
  order: (id: string) => number;
  isDragging: (id: string) => boolean;
  registerMember: (id: string) => void;
  unregisterMember: (id: string) => void;
  setNode: (id: string, el: HTMLElement | null) => void;
  onPointerDown: (id: string, e: RPointerEvent<HTMLElement>) => void;
  onPointerMove: (id: string, e: RPointerEvent<HTMLElement>) => void;
  onPointerUp: (id: string, e: RPointerEvent<HTMLElement>) => void;
  onPointerCancel: (id: string, e: RPointerEvent<HTMLElement>) => void;
}
const REORDER_DEFAULT: ReorderContextValue = {
  enabled: false,
  order: () => 0,
  isDragging: () => false,
  registerMember: noop,
  unregisterMember: noop,
  setNode: () => {},
  onPointerDown: () => {},
  onPointerMove: () => {},
  onPointerUp: () => {},
  onPointerCancel: () => {},
};
const ReorderContext = createContext<ReorderContextValue>(REORDER_DEFAULT);

export function ReorderGroup({ groupKey, className, children }: { groupKey: string; className?: string; children: ReactNode }) {
  const { enabled: custEnabled, orderFor, reorder } = useCustomize();
  const enabled = custEnabled && groupKey.trim().length > 0;
  const saved = orderFor(groupKey);

  // Members register in mount (= source) order; nodes live in a ref for hit-testing
  // during a drag (a moved rect shouldn't need a re-render to be seen).
  const [members, setMembers] = useState<string[]>([]);
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [working, setWorking] = useState<string[] | null>(null); // live order during a drag
  const workingRef = useRef<string[] | null>(null);
  const gestureRef = useRef<{ id: string; pointerId: number; x: number; y: number; dragging: boolean } | null>(null);
  // Imperative drag visuals. The picked-up card follows the pointer 1:1 via an
  // inline transform written straight to its DOM node (no React render per move).
  // Its untransformed slot position is cached here and re-measured pre-paint
  // whenever the order shuffles under it.
  const dragVisRef = useRef<{
    id: string;
    layoutLeft: number;
    layoutTop: number;
    startLeft: number;
    startTop: number;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);
  // Rects snapshotted just before an order flip, so siblings can FLIP-glide.
  const flipRectsRef = useRef<Map<string, DOMRect> | null>(null);
  // Where the finger released the card, so it can animate ("settle") into its slot.
  const settleRef = useRef<{ id: string; desiredLeft: number; desiredTop: number } | null>(null);

  const registerMember = useCallback((id: string) => {
    setMembers((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  const unregisterMember = useCallback((id: string) => {
    setMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev));
  }, []);
  const setNode = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodesRef.current.set(id, el);
    else nodesRef.current.delete(id);
  }, []);

  // Effective order: saved ids still present (in saved sequence), then any members
  // not in the saved list (newly-added cards) in their source order.
  const base = useMemo(() => {
    const memberSet = new Set(members);
    const savedSet = new Set(saved);
    const inSaved = saved.filter((id) => memberSet.has(id));
    const rest = members.filter((id) => !savedSet.has(id));
    return [...inSaved, ...rest];
  }, [members, saved]);

  const effective = working ?? base;
  const order = useCallback(
    (id: string) => {
      const i = effective.indexOf(id);
      return i < 0 ? members.indexOf(id) : i;
    },
    [effective, members],
  );
  const isDragging = useCallback((id: string) => draggingId === id, [draggingId]);

  // Which member's rect the pointer is over (the drop target under the finger).
  // The dragged card itself is excluded — it rides under the pointer, so its own
  // rect would otherwise mask every target beneath it.
  const hitTest = useCallback(
    (x: number, y: number, excludeId: string): string | null => {
      for (const id of members) {
        if (id === excludeId) continue;
        const el = nodesRef.current.get(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
      }
      return null;
    },
    [members],
  );

  const onPointerDown = useCallback(
    (id: string, e: RPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return; // left button only for mouse
      gestureRef.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (id: string, e: RPointerEvent<HTMLElement>) => {
      const g = gestureRef.current;
      if (!g || g.id !== id || e.pointerId !== g.pointerId) return;
      if (!g.dragging) {
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_THRESHOLD_PX) return;
        g.dragging = true;
        // Pick the card up: cache its untransformed slot position, stop its jiggle
        // immediately (React re-renders it jiggle-less a frame later), promote it
        // to its own layer.
        const el = nodesRef.current.get(id);
        if (el) {
          const r = el.getBoundingClientRect();
          dragVisRef.current = {
            id,
            layoutLeft: r.left,
            layoutTop: r.top,
            startLeft: r.left,
            startTop: r.top,
            startX: g.x,
            startY: g.y,
            curX: e.clientX,
            curY: e.clientY,
          };
          el.classList.remove("dash-jiggle");
          el.style.willChange = "transform";
        }
        workingRef.current = base;
        setWorking(base);
        setDraggingId(id);
      }
      // The card follows the finger 1:1 — inline transform written straight to the
      // DOM node on every move, so it visibly travels instead of snapping slots.
      const v = dragVisRef.current;
      if (v && v.id === id) {
        v.curX = e.clientX;
        v.curY = e.clientY;
        const el = nodesRef.current.get(id);
        if (el) {
          const tx = v.startLeft + (v.curX - v.startX) - v.layoutLeft;
          const ty = v.startTop + (v.curY - v.startY) - v.layoutTop;
          el.style.transform = `translate(${tx}px, ${ty}px) ${DRAG_LIFT}`;
        }
      }
      const target = hitTest(e.clientX, e.clientY, id);
      if (target) {
        const cur = workingRef.current ?? base;
        const from = cur.indexOf(id);
        const to = cur.indexOf(target);
        if (from >= 0 && to >= 0 && from !== to) {
          // Snapshot every card's rect BEFORE the order flips so the layout effect
          // below can FLIP-glide the siblings from where they were to where they land.
          const rects = new Map<string, DOMRect>();
          nodesRef.current.forEach((node, nid) => rects.set(nid, node.getBoundingClientRect()));
          flipRectsRef.current = rects;
          const next = [...cur];
          next.splice(from, 1);
          next.splice(to, 0, id);
          workingRef.current = next;
          setWorking(next);
        }
      }
    },
    [base, hitTest],
  );

  const finishDrag = useCallback(
    (commit: boolean) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      const wasDragging = !!g?.dragging;
      const v = dragVisRef.current;
      dragVisRef.current = null;
      if (wasDragging && v) {
        // Where the finger let go — the settle effect glides the card from here
        // into its final slot once the drop has rendered.
        settleRef.current = {
          id: v.id,
          desiredLeft: v.startLeft + (v.curX - v.startX),
          desiredTop: v.startTop + (v.curY - v.startY),
        };
      }
      const final = workingRef.current;
      workingRef.current = null;
      setDraggingId(null);
      if (commit && wasDragging && final) {
        const memberSet = new Set(members);
        const cleaned = final.filter((cid) => memberSet.has(cid));
        const changed = cleaned.length !== base.length || cleaned.some((v, i) => v !== base[i]);
        if (changed) {
          // Keep rendering the arranged order until the saved `base` catches up (the
          // effect below clears it), so the card doesn't snap back for a frame.
          setWorking(cleaned);
          reorder(groupKey, cleaned);
          return;
        }
      }
      setWorking(null);
    },
    [base, members, reorder, groupKey],
  );

  // Once the saved order updates after a drop — the optimistic write landing OR a
  // failure rolling it back — yield the drag's working copy to the source of truth.
  // Keyed on `base` only (NOT draggingId) so ending a drag can't wipe `working`
  // before `base` reflects it; the guard keeps a mid-drag member change from
  // cancelling an in-progress drag.
  useEffect(() => {
    if (!draggingId) setWorking(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // While a drag is live, every order shuffle moves the dragged card's SLOT — so,
  // pre-paint: re-measure that slot with the transform stripped (keeps the card
  // glued to the finger with no jump), then FLIP-glide the siblings from their
  // snapshotted rects into their new slots.
  useLayoutEffect(() => {
    const v = dragVisRef.current;
    if (!draggingId || !working || !v) return;
    const el = nodesRef.current.get(v.id);
    if (el) {
      el.style.transform = "none";
      const r = el.getBoundingClientRect();
      v.layoutLeft = r.left;
      v.layoutTop = r.top;
      const tx = v.startLeft + (v.curX - v.startX) - v.layoutLeft;
      const ty = v.startTop + (v.curY - v.startY) - v.layoutTop;
      el.style.transform = `translate(${tx}px, ${ty}px) ${DRAG_LIFT}`;
    }
    const prev = flipRectsRef.current;
    flipRectsRef.current = null;
    if (prev && !prefersReducedMotion()) {
      nodesRef.current.forEach((node, nid) => {
        if (nid === v.id) return;
        const was = prev.get(nid);
        if (!was) return;
        const now = node.getBoundingClientRect();
        const dx = was.left - now.left;
        const dy = was.top - now.top;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        // WAAPI, not inline styles: it layers OVER the jiggle keyframes and cleans
        // itself up, so the wobble resumes the instant the glide lands.
        node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
          { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );
      });
    }
  }, [working, draggingId]);

  // When the drag ends, the card glides ("settles") from wherever the finger left
  // it into its final slot — commit and cancel both pass through here.
  useLayoutEffect(() => {
    if (draggingId) return;
    const s = settleRef.current;
    settleRef.current = null;
    if (!s) return;
    const el = nodesRef.current.get(s.id);
    if (!el) return;
    el.style.transform = "";
    el.style.willChange = "";
    const r = el.getBoundingClientRect();
    const dx = s.desiredLeft - r.left;
    const dy = s.desiredTop - r.top;
    if (prefersReducedMotion() || (Math.abs(dx) < 2 && Math.abs(dy) < 2)) return;
    el.style.zIndex = "60"; // stay above siblings while gliding home
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) ${DRAG_LIFT}`, boxShadow: "0 12px 32px rgba(0,0,0,0.18)" },
        { transform: "translate(0px, 0px) scale(1)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
    const clear = () => {
      el.style.zIndex = "";
    };
    anim.onfinish = clear;
    anim.oncancel = clear;
  }, [draggingId]);

  const onPointerUp = useCallback(
    (id: string, e: RPointerEvent<HTMLElement>) => {
      const g = gestureRef.current;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (!g || g.id !== id) return;
      finishDrag(true);
    },
    [finishDrag],
  );

  const onPointerCancel = useCallback(
    (id: string, e: RPointerEvent<HTMLElement>) => {
      const g = gestureRef.current;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (!g || g.id !== id) return;
      finishDrag(false);
    },
    [finishDrag],
  );

  const value = useMemo<ReorderContextValue>(
    () => ({ enabled, order, isDragging, registerMember, unregisterMember, setNode, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }),
    [enabled, order, isDragging, registerMember, unregisterMember, setNode, onPointerDown, onPointerMove, onPointerUp, onPointerCancel],
  );

  return (
    <ReorderContext.Provider value={value}>
      <div className={className}>{children}</div>
    </ReorderContext.Provider>
  );
}

export interface Reorderable {
  enabled: boolean;
  /** CSS `order` for this card's grid item (undefined off a group). */
  order?: number;
  isDragging: boolean;
  /** Ref callback for the card's root, so the group can measure it while dragging. */
  setNodeRef?: (el: HTMLElement | null) => void;
  dragHandlers: {
    onPointerDown?: (e: RPointerEvent<HTMLElement>) => void;
    onPointerMove?: (e: RPointerEvent<HTMLElement>) => void;
    onPointerUp?: (e: RPointerEvent<HTMLElement>) => void;
    onPointerCancel?: (e: RPointerEvent<HTMLElement>) => void;
  };
}

function useReorder(id: string): Reorderable {
  const ctx = useContext(ReorderContext);
  const { enabled, registerMember, unregisterMember, setNode } = ctx;

  useEffect(() => {
    if (!enabled) return;
    registerMember(id);
    return () => unregisterMember(id);
  }, [enabled, id, registerMember, unregisterMember]);

  // Stable across drag frames (depends only on stable fns + id) so React doesn't
  // detach/reattach the node every time the group's context value changes.
  const setNodeRef = useCallback(
    (el: HTMLElement | null) => {
      if (enabled) setNode(id, el);
    },
    [enabled, setNode, id],
  );

  if (!enabled) {
    return { enabled: false, order: undefined, isDragging: false, setNodeRef: undefined, dragHandlers: {} };
  }
  return {
    enabled: true,
    order: ctx.order(id),
    isDragging: ctx.isDragging(id),
    setNodeRef,
    dragHandlers: {
      onPointerDown: (e) => ctx.onPointerDown(id, e),
      onPointerMove: (e) => ctx.onPointerMove(id, e),
      onPointerUp: (e) => ctx.onPointerUp(id, e),
      onPointerCancel: (e) => ctx.onPointerCancel(id, e),
    },
  };
}

// ─── useHideable — baked into card primitives ─────────────────────────────────
export interface HideableProps {
  onContextMenu?: (e: RMouseEvent) => void;
  onPointerDown?: (e: RPointerEvent<HTMLElement>) => void;
  onPointerMove?: (e: RPointerEvent<HTMLElement>) => void;
  onPointerUp?: (e: RPointerEvent<HTMLElement>) => void;
  onPointerCancel?: (e: RPointerEvent<HTMLElement>) => void;
  ref?: (el: HTMLElement | null) => void;
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
  const reorder = useReorder(id);
  const hidden = enabled && isHidden(id);

  if (!enabled) {
    return { enabled: false, hidden: false, editing: false, handlers: {}, jiggleClass: "", badge: null, placeholder: null };
  }

  // Reorder wiring: apply the saved CSS `order` ALWAYS (so an arrangement persists
  // in normal view too), but only accept drags — and suppress touch-scroll — in edit
  // mode. The dragged card lifts (scales, shadow, above its peers) and stops jiggling.
  const style: CSSProperties = {
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    ...(reorder.enabled && reorder.order !== undefined ? { order: reorder.order } : {}),
    ...(editing
      ? {
          animationDelay: `${delayRef.current}s`,
          ...(reorder.enabled ? { touchAction: "none", cursor: reorder.isDragging ? "grabbing" : "grab" } : {}),
        }
      : {}),
    // NOTE: no `transform` here while dragging — the ReorderGroup owns the dragged
    // card's transform imperatively (it follows the pointer); if React also wrote
    // one, every re-render would yank the card out from under the finger.
    ...(reorder.isDragging
      ? { position: "relative", zIndex: 50, boxShadow: "0 12px 32px rgba(0,0,0,0.18)" }
      : {}),
  } as CSSProperties;

  const handlers: HideableProps & TouchHandlers = {
    onContextMenu: (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, id, label);
    },
    ...longPress,
    ...(editing ? reorder.dragHandlers : {}),
    ref: reorder.setNodeRef,
    style,
  };

  // A hidden card leaves an in-place dashed "+" slot WHILE EDITING, so it can be
  // brought back exactly where it lived (and holds its place in the arrangement).
  // Not editing → it renders nothing at all.
  const placeholder =
    hidden && editing ? (
      <HiddenPlaceholder
        label={label}
        onShow={() => show(id)}
        className={opts?.placeholderClassName}
        minH={opts?.placeholderMinH}
        order={reorder.enabled ? reorder.order : undefined}
        innerRef={reorder.setNodeRef}
      />
    ) : null;

  return {
    enabled: true,
    hidden,
    editing,
    handlers,
    jiggleClass: editing ? (reorder.isDragging ? "relative" : "relative dash-jiggle") : "",
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
  order,
  innerRef,
}: {
  label: string;
  onShow: () => void;
  className?: string;
  minH?: string;
  // Keeps the placeholder in its arrangement slot and registers it as a drop target
  // so visible cards can be dragged around it while editing.
  order?: number;
  innerRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <button
      type="button"
      ref={innerRef}
      style={order !== undefined ? { order } : undefined}
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
              Drag to rearrange · <span className="font-semibold">−</span> to hide · <span className="font-semibold">+</span> to bring back
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
