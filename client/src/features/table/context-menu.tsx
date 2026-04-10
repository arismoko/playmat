import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export type ContextMenuItem = {
  label: string;
  checked?: boolean;
  children?: ContextMenuItem[];
  disabled?: boolean;
  shortcut?: string;
  danger?: boolean;
  onSelect?: () => void;
};

type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
};

export function ContextMenu({ x, y, items }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [activeChild, setActiveChild] = useState<{
    items: ContextMenuItem[];
    key: string;
    top: number;
  } | null>(null);
  const [submenuPlacement, setSubmenuPlacement] = useState<{
    direction: "left" | "right";
    top: number;
  }>({ direction: "right", top: 0 });

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      setPosition({ left: x, top: y });
      return;
    }

    const updatePosition = () => {
      const element = menuRef.current;

      if (!element) {
        setPosition({
          left: Math.max(12, Math.min(x, window.innerWidth - 12)),
          top: Math.max(12, Math.min(y, window.innerHeight - 12)),
        });
        return;
      }

      const rect = element.getBoundingClientRect();
      const left = Math.max(12, Math.min(x, window.innerWidth - rect.width - 12));
      const top = Math.max(12, Math.min(y, window.innerHeight - rect.height - 12));

      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [items.length, x, y]);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || !activeChild) {
      return;
    }

    const updatePlacement = () => {
      const menuElement = menuRef.current;
      const submenuElement = submenuRef.current;

      if (!menuElement || !submenuElement) {
        return;
      }

      const menuRect = menuElement.getBoundingClientRect();
      const submenuRect = submenuElement.getBoundingClientRect();
      const fitsRight = menuRect.right - 8 + submenuRect.width <= window.innerWidth - 12;
      const fitsLeft = menuRect.left + 8 - submenuRect.width >= 12;
      const direction = fitsRight || !fitsLeft ? "right" : "left";
      const minTop = 12 - position.top;
      const maxTop = window.innerHeight - position.top - submenuRect.height - 12;
      const top = Math.max(minTop, Math.min(activeChild.top, maxTop));

      setSubmenuPlacement({ direction, top });
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);

    return () => {
      window.removeEventListener("resize", updatePlacement);
    };
  }, [activeChild, position.left, position.top]);

  return (
      <div
        className="game-table-context-menu-shell"
        style={{ left: position.left, top: position.top } as CSSProperties}
        onMouseLeave={() => setActiveChild(null)}
      >
        <div
          className="game-table-context-menu game-table-context-menu-root"
          ref={menuRef}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
        {items.map((item) => {
          const itemKey = `${item.label}-${item.shortcut ?? ""}`;

          return (
          <button
            className={`game-table-context-menu-item${item.danger ? " game-table-context-menu-item-danger" : ""}${item.disabled ? " game-table-context-menu-item-disabled" : ""}`}
            key={itemKey}
            type="button"
            disabled={item.disabled}
            onMouseEnter={(event) => {
              if (!item.children?.length) {
                setActiveChild(null);
                return;
              }

              setActiveChild({
                items: item.children,
                key: itemKey,
                top: event.currentTarget.offsetTop,
              });
            }}
            onClick={() => {
              if (item.disabled || item.children?.length || !item.onSelect) {
                return;
              }

              item.onSelect();
            }}
          >
            <span className="game-table-context-menu-label">
              {item.checked ? <span className="game-table-context-menu-check">✓</span> : null}
              <span>{item.label}</span>
            </span>
            {item.children?.length ? (
              <span className="game-table-context-menu-shortcut">›</span>
            ) : item.shortcut ? (
              <span className="game-table-context-menu-shortcut">{item.shortcut}</span>
            ) : null}
          </button>
        );})}
        </div>

        {activeChild ? (
          <div
            className={`game-table-context-menu game-table-context-submenu${submenuPlacement.direction === "left" ? " game-table-context-submenu-left" : ""}`}
            ref={submenuRef}
            style={{ top: submenuPlacement.top } as CSSProperties}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {activeChild.items.map((item) => (
              <button
                className={`game-table-context-menu-item${item.danger ? " game-table-context-menu-item-danger" : ""}${item.disabled ? " game-table-context-menu-item-disabled" : ""}`}
                key={`${activeChild.key}-${item.label}-${item.shortcut ?? ""}`}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled || !item.onSelect) {
                    return;
                  }

                  item.onSelect();
                }}
              >
                <span className="game-table-context-menu-label">
                  {item.checked ? <span className="game-table-context-menu-check">✓</span> : null}
                  <span>{item.label}</span>
                </span>
                {item.shortcut ? (
                  <span className="game-table-context-menu-shortcut">{item.shortcut}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
  );
}
