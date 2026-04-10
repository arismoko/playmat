import type { ReactNode } from "react";

type MasterDetailPanelProps = {
  detail: ReactNode;
  detailClassName?: string;
  list: ReactNode;
  listAriaLabel: string;
  listClassName?: string;
};

export function MasterDetailPanel({
  detail,
  detailClassName,
  list,
  listAriaLabel,
  listClassName,
}: MasterDetailPanelProps) {
  return (
    <div className="game-table-master-detail-body">
      <div
        aria-label={listAriaLabel}
        className={[
          "game-table-master-detail-list",
          listClassName ?? "",
        ].filter(Boolean).join(" ")}
        role="listbox"
      >
        {list}
      </div>

      <aside
        className={[
          "game-table-master-detail-detail",
          detailClassName ?? "",
        ].filter(Boolean).join(" ")}
      >
        {detail}
      </aside>
    </div>
  );
}
