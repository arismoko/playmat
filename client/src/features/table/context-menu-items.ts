import type { CardView, LibraryPosition, PlayerView, ZoneName } from "@playmat/shared/table";
import type { ContextMenuItem } from "./context-menu";
import type { TableCardSelection } from "./use-table-interaction";

type CardContextMenuCallbacks = {
  onAttachToCard: (selection: TableCardSelection) => void;
  onClearArrows: (selection: TableCardSelection) => void;
  onCloneCard: (selection: TableCardSelection) => void;
  onCreateToken: (selection: TableCardSelection) => void;
  onDrawArrow: (selection: TableCardSelection) => void;
  onAdjustPtModifier: (selection: TableCardSelection, powerDelta: number, toughnessDelta: number) => void;
  onPeekAtFace: (selection: TableCardSelection) => void;
  onMoveCard: (selection: TableCardSelection, to: ZoneName) => void;
  onMoveCardToLibrary: (
    selection: TableCardSelection,
    options: { promptForOffset?: boolean; toIndex?: number; toPosition: LibraryPosition },
  ) => void;
  onOpenRelatedCards: (selection: TableCardSelection) => void;
  onPlayFaceDown: (selection: TableCardSelection) => void;
  onRevealCards: (selection: TableCardSelection, targetPlayerId: string | "all") => void;
  onSelectAllBattlefieldCards: (selection: TableCardSelection) => void;
  onSelectBattlefieldRow: (selection: TableCardSelection) => void;
  onSelectAllVisibleViewerCards: (selection: TableCardSelection) => void;
  onSelectViewerColumnCards: (selection: TableCardSelection) => void;
  onSelectAllHand: () => void;
  onSetAnnotation: (selection: TableCardSelection) => void;
  onSetCounter: (
    selection: TableCardSelection,
    counter: string,
    value: number,
  ) => void;
  onSetCounterByDelta: (selection: TableCardSelection, counter: string, delta: number) => void;
  onSetCustomCounter: (selection: TableCardSelection) => void;
  onSetDoesNotUntap: (selection: TableCardSelection, doesNotUntap: boolean) => void;
  onSetSpecificCounterValue: (selection: TableCardSelection, counter: string) => void;
  onSetPtModifier: (selection: TableCardSelection) => void;
  onResetPtModifier: (selection: TableCardSelection) => void;
  onTapCard: (selection: TableCardSelection) => void;
  onToggleFaceDown: (selection: TableCardSelection) => void;
  onTransformCard: (selection: TableCardSelection) => void;
  onUnattachCard: (selection: TableCardSelection) => void;
  onHideViewerCards: (selection: TableCardSelection) => void;
};

type CardMenuOptions = {
  canShowRelatedCards?: boolean;
  canTransform?: boolean;
  viewerSupportsColumnSelection?: boolean;
};

type CardMenuContext = {
  card: CardView | null;
  callbacks: CardContextMenuCallbacks;
  options: CardMenuOptions;
  otherPlayers: PlayerView[];
  selection: TableCardSelection;
  selectionCount: number;
};

export type LibraryMenuCallbacks = {
  onDraw: (count: number, position?: LibraryPosition) => void;
  onLibraryToZone: (options: {
    count: number;
    faceDown?: boolean;
    position: LibraryPosition;
    to: ZoneName;
  }) => void;
  onOpenDeckEditor: () => void;
  onPromptForCount: (
    title: string,
    onSubmit: (count: number) => void,
    options?: { defaultValue?: string; min?: number },
  ) => void;
  onSetLibraryFlag: (flag: "always-look-at-top" | "always-reveal-top", enabled: boolean) => void;
  onRevealZone: (options: {
    count?: number;
    position?: LibraryPosition;
    targetPlayerId: string | "all";
    zone: ZoneName;
  }) => void;
  onShiftLibrary: (from: LibraryPosition, to: LibraryPosition) => void;
  onShuffle: (slice?: { count: number; position: LibraryPosition }) => void;
  onUndo: () => void;
  onViewZone: (options: { count?: number; position?: LibraryPosition; zone: ZoneName }) => void;
};

export type HandSortCriterion = "name" | "type" | "mana-value";

export type ZoneFieldMenuCallbacks = {
  onMoveZone: (options: { from: ZoneName; to: ZoneName; toPosition?: LibraryPosition }) => void;
  onPromptForCount: (
    title: string,
    onSubmit: (count: number) => void,
    options?: { defaultValue?: string; min?: number },
  ) => void;
  onRevealZone: (options: {
    count?: number;
    position?: LibraryPosition;
    targetPlayerId: string | "all";
    zone: ZoneName;
  }) => void;
  onRevealRandomCard: (options: {
    targetPlayerId: string | "all";
    zone: ZoneName;
  }) => void;
  onSortHand: (sortBy: HandSortCriterion) => void;
  onTakeMulligan: (count: number) => void;
  onViewZone: (options: { count?: number; position?: LibraryPosition; zone: ZoneName }) => void;
};

type ZoneFieldMenuContext = {
  flags: { alwaysLookAtTop: boolean; alwaysRevealTop: boolean };
  isOwner: boolean;
  libraryCallbacks: LibraryMenuCallbacks;
  libraryCount: number;
  otherPlayers: PlayerView[];
  zoneCallbacks: ZoneFieldMenuCallbacks;
  zone: ZoneName;
  zoneCount: number;
};

function formatMoveLabel(label: string, selectionCount: number): string {
  return selectionCount > 1 ? `Move ${selectionCount} cards to ${label}` : `Move to ${label}`;
}

function buildFlatCardMoveItems(
  selection: TableCardSelection,
  selectionCount: number,
  callbacks: CardContextMenuCallbacks,
): ContextMenuItem[] {
  const targets = [
    { label: "hand", shortcut: "H", zone: "hand" },
    { label: "graveyard", shortcut: "G", zone: "graveyard" },
    { label: "exile", shortcut: "X", zone: "exile" },
    { label: "library", shortcut: "L", zone: "library" },
  ] satisfies Array<{ label: string; shortcut?: string; zone: ZoneName }>;

  return targets
    .filter((target) => target.zone !== selection.zone)
    .map((target) => ({
      label: formatMoveLabel(target.label, selectionCount),
      onSelect: () => callbacks.onMoveCard(selection, target.zone),
      shortcut: target.shortcut,
    }));
}

function buildBattlefieldSingleCardContextMenuItems({
  card,
  callbacks,
  options,
  selection,
  selectionCount: _selectionCount,
}: CardMenuContext): ContextMenuItem[] {
  const canUnattach = Boolean(card?.attachedToCardId);
  const counterNames = Array.from(new Set([
    "+1/+1",
    "-1/-1",
    "charge",
    "loyalty",
    "stun",
    ...Object.keys(card?.counters ?? {}),
  ]));
  const ptModifier = card?.ptModifier ?? { power: 0, toughness: 0 };

  return [
    {
      label: "Tap or untap",
      onSelect: () => callbacks.onTapCard(selection),
      shortcut: "T",
    },
    {
      label: "Toggle normal untapping",
      checked: !(card?.doesNotUntap ?? false),
      onSelect: () => callbacks.onSetDoesNotUntap(selection, !(card?.doesNotUntap ?? false)),
    },
    {
      label: "Turn Over",
      onSelect: () => callbacks.onToggleFaceDown(selection),
      shortcut: "F",
    },
    ...(card?.faceDown
      ? [
          {
            label: "Peek at card face",
            onSelect: () => callbacks.onPeekAtFace(selection),
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(options.canShowRelatedCards
      ? [
          {
            label: "Related cards...",
            onSelect: () => callbacks.onOpenRelatedCards(selection),
          } satisfies ContextMenuItem,
        ]
      : []),
    {
      label: "Clone",
      onSelect: () => callbacks.onCloneCard(selection),
    },
    {
      label: "Attach to card...",
      onSelect: () => callbacks.onAttachToCard(selection),
    },
    {
      label: "Unattach",
      disabled: !canUnattach,
      onSelect: () => callbacks.onUnattachCard(selection),
    },
    {
      label: "Draw arrow...",
      onSelect: () => callbacks.onDrawArrow(selection),
    },
    {
      label: "Clear arrows",
      onSelect: () => callbacks.onClearArrows(selection),
    },
    {
      label: "Move to...",
      children: buildHandMoveToItems(selection, callbacks, { includeHand: true }),
    },
    {
      label: "Select All",
      onSelect: () => callbacks.onSelectAllBattlefieldCards(selection),
    },
    {
      label: "Select Row",
      onSelect: () => callbacks.onSelectBattlefieldRow(selection),
    },
    {
      label: "Power / toughness...",
      children: [
        {
          label: "Increase power",
          onSelect: () => callbacks.onAdjustPtModifier(selection, 1, 0),
        },
        {
          label: "Decrease power",
          onSelect: () => callbacks.onAdjustPtModifier(selection, -1, 0),
        },
        {
          label: "Increase power and decrease toughness",
          onSelect: () => callbacks.onAdjustPtModifier(selection, 1, -1),
        },
        {
          label: "Increase toughness",
          onSelect: () => callbacks.onAdjustPtModifier(selection, 0, 1),
        },
        {
          label: "Decrease toughness",
          onSelect: () => callbacks.onAdjustPtModifier(selection, 0, -1),
        },
        {
          label: "Decrease power and increase toughness",
          onSelect: () => callbacks.onAdjustPtModifier(selection, -1, 1),
        },
        {
          label: "Increase power and toughness",
          onSelect: () => callbacks.onAdjustPtModifier(selection, 1, 1),
        },
        {
          label: "Decrease power and toughness",
          onSelect: () => callbacks.onAdjustPtModifier(selection, -1, -1),
        },
        {
          label: "Set power and toughness...",
          onSelect: () => callbacks.onSetPtModifier(selection),
        },
        {
          label: "Reset power and toughness",
          disabled: ptModifier.power === 0 && ptModifier.toughness === 0,
          onSelect: () => callbacks.onResetPtModifier(selection),
        },
      ],
    },
    {
      label: "Set annotation...",
      onSelect: () => callbacks.onSetAnnotation(selection),
    },
    {
      label: "Card counters...",
      children: [
        ...counterNames.flatMap((counterName) => {
          const currentValue = card?.counters[counterName] ?? 0;

          return [
            {
              label: `Add counter (${counterName})`,
              onSelect: () => callbacks.onSetCounterByDelta(selection, counterName, 1),
            },
            ...(currentValue > 0
              ? [
                  {
                    label: `Remove counter (${counterName})`,
                    onSelect: () => callbacks.onSetCounterByDelta(selection, counterName, -1),
                  } satisfies ContextMenuItem,
                ]
              : []),
            {
              label: `Set counters (${counterName})...`,
              onSelect: () => callbacks.onSetSpecificCounterValue(selection, counterName),
            },
          ];
        }),
        {
          label: "Set custom counter...",
          onSelect: () => callbacks.onSetCustomCounter(selection),
        },
      ],
    },
    {
      label: "Create token...",
      onSelect: () => callbacks.onCreateToken(selection),
    },
    ...(options.canTransform
      ? [
          {
            label: "Transform",
            onSelect: () => callbacks.onTransformCard(selection),
            shortcut: "R",
          } satisfies ContextMenuItem,
        ]
      : []),
  ];
}

function buildBattlefieldMultiCardContextMenuItems({
  callbacks,
  selection,
  selectionCount: _selectionCount,
}: CardMenuContext): ContextMenuItem[] {
  return [
    {
      label: "Move to...",
      children: buildHandMoveToItems(selection, callbacks, { includeHand: true }),
    },
    {
      label: "Select All",
      onSelect: () => callbacks.onSelectAllBattlefieldCards(selection),
    },
    {
      label: "Select Row",
      onSelect: () => callbacks.onSelectBattlefieldRow(selection),
    },
  ];
}

function buildNonBattlefieldCardContextMenuItems({
  callbacks,
  selection,
  selectionCount,
}: CardMenuContext): ContextMenuItem[] {
  return [
    {
      label:
        selectionCount > 1
          ? `Play ${selectionCount} cards to battlefield`
          : "Play to battlefield",
      onSelect: () => callbacks.onMoveCard(selection, "battlefield"),
    },
    ...buildFlatCardMoveItems(selection, selectionCount, callbacks),
  ];
}

function buildHandRevealItems(
  selection: TableCardSelection,
  otherPlayers: PlayerView[],
  callbacks: CardContextMenuCallbacks,
): ContextMenuItem[] {
  return buildTargetItems(
    otherPlayers,
    (targetPlayerId) => ({
      onSelect: () => callbacks.onRevealCards(selection, targetPlayerId),
    }),
    true,
  );
}

function buildHandMoveToItems(
  selection: TableCardSelection,
  callbacks: CardContextMenuCallbacks,
  options: { includeHand?: boolean } = {},
): ContextMenuItem[] {
  return [
    {
      label: "Top of library in random order",
      onSelect: () => callbacks.onMoveCardToLibrary(selection, { toPosition: "top" }),
    },
    {
      label: "X cards from the top of library...",
      onSelect: () => callbacks.onMoveCardToLibrary(selection, { promptForOffset: true, toPosition: "top" }),
    },
    {
      label: "Bottom of library in random order",
      onSelect: () => callbacks.onMoveCardToLibrary(selection, { toPosition: "bottom" }),
    },
    ...(options.includeHand && selection.zone !== "hand"
      ? [
          {
            label: "Hand",
            onSelect: () => callbacks.onMoveCard(selection, "hand"),
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(selection.zone !== "graveyard"
      ? [
          {
            label: "Graveyard",
            onSelect: () => callbacks.onMoveCard(selection, "graveyard"),
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(selection.zone !== "exile"
      ? [
          {
            label: "Exile",
            onSelect: () => callbacks.onMoveCard(selection, "exile"),
          } satisfies ContextMenuItem,
        ]
      : []),
  ];
}

function buildHandCardContextMenuItems({
  options,
  otherPlayers,
  callbacks,
  selection,
  selectionCount,
}: CardMenuContext): ContextMenuItem[] {
  const revealItems = buildHandRevealItems(selection, otherPlayers, callbacks);
  const moveItems = buildHandMoveToItems(selection, callbacks);

  return [
    {
      label: selectionCount > 1 ? `Play ${selectionCount} cards` : "Play",
      onSelect: () => callbacks.onMoveCard(selection, "battlefield"),
    },
    {
      label: selectionCount > 1 ? `Play ${selectionCount} cards face down` : "Play Face Down",
      onSelect: () => callbacks.onPlayFaceDown(selection),
    },
    {
      label: "Reveal to...",
      disabled: revealItems.length === 0,
      children: revealItems,
    },
    {
      label: selectionCount > 1 ? `Clone ${selectionCount} cards` : "Clone",
      onSelect: () => callbacks.onCloneCard(selection),
    },
    {
      label: "Move to...",
      children: moveItems,
    },
    {
      label: "Attach to card...",
      onSelect: () => callbacks.onAttachToCard(selection),
    },
    {
      label: "Draw arrow...",
      onSelect: () => callbacks.onDrawArrow(selection),
    },
    {
      label: "Select All",
      onSelect: callbacks.onSelectAllHand,
    },
    ...(options.canShowRelatedCards
      ? [
          {
            label: "Related cards...",
            onSelect: () => callbacks.onOpenRelatedCards(selection),
          } satisfies ContextMenuItem,
        ]
      : []),
  ];
}

function buildViewerSelectionItems(
  selection: TableCardSelection,
  callbacks: CardContextMenuCallbacks,
  options: CardMenuOptions,
): ContextMenuItem[] {
  return [
    {
      label: "Select All",
      onSelect: () => callbacks.onSelectAllVisibleViewerCards(selection),
    },
    ...(options.viewerSupportsColumnSelection
      ? [
          {
            label: "Select Column",
            onSelect: () => callbacks.onSelectViewerColumnCards(selection),
          } satisfies ContextMenuItem,
        ]
      : []),
  ];
}

function buildViewerReadonlyCardContextMenuItems(
  selection: TableCardSelection,
  selectionCount: number,
  callbacks: CardContextMenuCallbacks,
  options: CardMenuOptions & { readOnly: boolean },
): ContextMenuItem[] {
  const selectionItems = buildViewerSelectionItems(selection, callbacks, options);
  const relatedItems = options.canShowRelatedCards
    ? [
        {
          label: "Related cards...",
          onSelect: () => callbacks.onOpenRelatedCards(selection),
        } satisfies ContextMenuItem,
      ]
    : [];

  if (selection.zone === "graveyard" || selection.zone === "exile") {
    return [
      {
        label: selectionCount > 1 ? `Clone ${selectionCount} cards` : "Clone",
        onSelect: () => callbacks.onCloneCard(selection),
      },
      ...selectionItems,
      {
        label: "Draw arrow...",
        onSelect: () => callbacks.onDrawArrow(selection),
      },
      ...relatedItems,
    ];
  }

  return [
    {
      label: "Hide",
      onSelect: () => callbacks.onHideViewerCards(selection),
    },
    {
      label: selectionCount > 1 ? `Clone ${selectionCount} cards` : "Clone",
      onSelect: () => callbacks.onCloneCard(selection),
    },
    ...selectionItems,
    ...relatedItems,
  ];
}

function buildViewerOwnedCardContextMenuItems(
  selection: TableCardSelection,
  selectionCount: number,
  otherPlayers: PlayerView[],
  callbacks: CardContextMenuCallbacks,
  options: CardMenuOptions,
): ContextMenuItem[] {
  const moveItems = buildHandMoveToItems(selection, callbacks, { includeHand: selection.zone !== "hand" });
  const selectionItems = buildViewerSelectionItems(selection, callbacks, options);
  const relatedItems = options.canShowRelatedCards
    ? [
        {
          label: "Related cards...",
          onSelect: () => callbacks.onOpenRelatedCards(selection),
        } satisfies ContextMenuItem,
      ]
    : [];

  if (selection.zone === "graveyard" || selection.zone === "exile") {
    return [
      {
        label: selectionCount > 1 ? `Play ${selectionCount} cards` : "Play",
        onSelect: () => callbacks.onMoveCard(selection, "battlefield"),
      },
      {
        label: selectionCount > 1 ? `Play ${selectionCount} cards face down` : "Play Face Down",
        onSelect: () => callbacks.onPlayFaceDown(selection),
      },
      {
        label: selectionCount > 1 ? `Clone ${selectionCount} cards` : "Clone",
        onSelect: () => callbacks.onCloneCard(selection),
      },
      {
        label: "Move to...",
        children: moveItems,
      },
      ...selectionItems,
      {
        label: "Attach to card...",
        onSelect: () => callbacks.onAttachToCard(selection),
      },
      {
        label: "Draw arrow...",
        onSelect: () => callbacks.onDrawArrow(selection),
      },
      ...relatedItems,
    ];
  }

  const revealItems = buildHandRevealItems(selection, otherPlayers, callbacks);
  const ownedItems: ContextMenuItem[] = [
    {
      label: selectionCount > 1 ? `Play ${selectionCount} cards` : "Play",
      onSelect: () => callbacks.onMoveCard(selection, "battlefield"),
    },
    {
      label: selectionCount > 1 ? `Play ${selectionCount} cards face down` : "Play Face Down",
      onSelect: () => callbacks.onPlayFaceDown(selection),
    },
    {
      label: "Reveal to...",
      disabled: revealItems.length === 0,
      children: revealItems,
    },
    {
      label: selectionCount > 1 ? `Clone ${selectionCount} cards` : "Clone",
      onSelect: () => callbacks.onCloneCard(selection),
    },
    {
      label: "Move to...",
      children: moveItems,
    },
    ...selectionItems,
    ...relatedItems,
  ];

  if (selection.zone === "hand") {
    ownedItems.push(
      {
        label: "Attach to card...",
        onSelect: () => callbacks.onAttachToCard(selection),
      },
      {
        label: "Draw arrow...",
        onSelect: () => callbacks.onDrawArrow(selection),
      },
    );
  }

  return ownedItems;
}

export function buildViewerCardContextMenuItems(
  selection: TableCardSelection,
  selectionCount: number,
  callbacks: CardContextMenuCallbacks,
  otherPlayers: PlayerView[],
  options: CardMenuOptions & { readOnly: boolean },
): ContextMenuItem[] {
  if (options.readOnly) {
    return buildViewerReadonlyCardContextMenuItems(selection, selectionCount, callbacks, options);
  }

  return buildViewerOwnedCardContextMenuItems(selection, selectionCount, otherPlayers, callbacks, options);
}

export function buildCardContextMenuItems(
  selection: TableCardSelection,
  card: CardView | null,
  selectionCount: number,
  callbacks: CardContextMenuCallbacks,
  otherPlayers: PlayerView[],
  options: CardMenuOptions = {},
): ContextMenuItem[] {
  const context = {
    card,
    callbacks,
    options,
    otherPlayers,
    selection,
    selectionCount,
  } satisfies CardMenuContext;

  if (selection.zone === "battlefield") {
    return selectionCount === 1
      ? buildBattlefieldSingleCardContextMenuItems(context)
      : buildBattlefieldMultiCardContextMenuItems(context);
  }

  if (selection.zone === "hand") {
    return buildHandCardContextMenuItems(context);
  }

  return buildNonBattlefieldCardContextMenuItems(context);
}

export function buildReadonlyBattlefieldCardContextMenuItems(
  selection: TableCardSelection,
  selectionCount: number,
  callbacks: CardContextMenuCallbacks,
  options: CardMenuOptions,
): ContextMenuItem[] {
  return [
    {
      label: selectionCount > 1 ? `Clone ${selectionCount} cards` : "Clone",
      onSelect: () => callbacks.onCloneCard(selection),
    },
    {
      label: "Draw arrow...",
      onSelect: () => callbacks.onDrawArrow(selection),
    },
    {
      label: "Select All",
      onSelect: () => callbacks.onSelectAllBattlefieldCards(selection),
    },
    {
      label: "Select Row",
      onSelect: () => callbacks.onSelectBattlefieldRow(selection),
    },
    ...(options.canShowRelatedCards
      ? [
          {
            label: "Related cards...",
            onSelect: () => callbacks.onOpenRelatedCards(selection),
          } satisfies ContextMenuItem,
        ]
      : []),
  ];
}

function buildTargetItems(
  targets: PlayerView[],
  buildItem: (targetPlayerId: string | "all") => Omit<ContextMenuItem, "label"> & { label?: string },
  includeAllPlayers: boolean,
): ContextMenuItem[] {
  if (targets.length === 0) {
    return [];
  }

  return [
    ...(includeAllPlayers ? [{ label: "All players", ...buildItem("all") }] : []),
    ...targets.map((player) => {
      const item = buildItem(player.id);

      return {
        ...item,
        label: item.label?.trim() ? item.label : player.name,
      };
    }),
  ];
}

export function buildLibraryContextMenuItems(
  libraryCount: number,
  flags: { alwaysLookAtTop: boolean; alwaysRevealTop: boolean },
  targets: PlayerView[],
  callbacks: LibraryMenuCallbacks,
): ContextMenuItem[] {
  const hasCards = libraryCount > 0;
  const revealLibraryItems = buildTargetItems(
    targets,
    (targetPlayerId) => ({
      label: targetPlayerId === "all" ? "All players" : "",
      disabled: !hasCards,
      onSelect: () => callbacks.onRevealZone({ targetPlayerId, zone: "library" }),
    }),
    true,
  );
  const revealTopItems = buildTargetItems(
    targets,
    (targetPlayerId) => ({
      label: targetPlayerId === "all" ? "All players" : undefined,
      disabled: !hasCards,
      onSelect: () =>
        callbacks.onPromptForCount("Reveal top cards", (count) => callbacks.onRevealZone({
          count,
          position: "top",
          targetPlayerId,
          zone: "library",
        })),
    }),
    true,
  );

  const topLibraryItems: ContextMenuItem[] = [
    { label: "Play top card", disabled: !hasCards, onSelect: () => callbacks.onLibraryToZone({ count: 1, position: "top", to: "battlefield" }) },
    { label: "Play top card face down", disabled: !hasCards, onSelect: () => callbacks.onLibraryToZone({ count: 1, faceDown: true, position: "top", to: "battlefield" }) },
    { label: "Put top card on bottom", disabled: !hasCards, onSelect: () => callbacks.onShiftLibrary("top", "bottom") },
    { label: "Move top card to graveyard", disabled: !hasCards, onSelect: () => callbacks.onLibraryToZone({ count: 1, position: "top", to: "graveyard" }) },
    { label: "Move top cards to graveyard...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Move top cards to graveyard", (count) => callbacks.onLibraryToZone({ count, position: "top", to: "graveyard" })) },
    { label: "Move top cards to graveyard face down...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Move top cards to graveyard face down", (count) => callbacks.onLibraryToZone({ count, faceDown: true, position: "top", to: "graveyard" })) },
    { label: "Move top card to exile", disabled: !hasCards, onSelect: () => callbacks.onLibraryToZone({ count: 1, position: "top", to: "exile" }) },
    { label: "Move top cards to exile...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Move top cards to exile", (count) => callbacks.onLibraryToZone({ count, position: "top", to: "exile" })) },
    { label: "Move top cards to exile face down...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Move top cards to exile face down", (count) => callbacks.onLibraryToZone({ count, faceDown: true, position: "top", to: "exile" })) },
    { label: "Shuffle top cards...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Shuffle top cards", (count) => callbacks.onShuffle({ count, position: "top" })) },
  ];

  const bottomLibraryItems: ContextMenuItem[] = [
    { label: "Draw bottom card", disabled: !hasCards, onSelect: () => callbacks.onDraw(1, "bottom") },
    { label: "Draw bottom cards...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Draw bottom cards", (count) => callbacks.onDraw(count, "bottom")) },
    { label: "Play bottom card", disabled: !hasCards, onSelect: () => callbacks.onLibraryToZone({ count: 1, position: "bottom", to: "battlefield" }) },
    { label: "Play bottom card face down", disabled: !hasCards, onSelect: () => callbacks.onLibraryToZone({ count: 1, faceDown: true, position: "bottom", to: "battlefield" }) },
    { label: "Put bottom card on top", disabled: !hasCards, onSelect: () => callbacks.onShiftLibrary("bottom", "top") },
    { label: "Move bottom card to graveyard", disabled: !hasCards, onSelect: () => callbacks.onLibraryToZone({ count: 1, position: "bottom", to: "graveyard" }) },
    { label: "Move bottom cards to graveyard...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Move bottom cards to graveyard", (count) => callbacks.onLibraryToZone({ count, position: "bottom", to: "graveyard" })) },
    { label: "Move bottom cards to graveyard face down...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Move bottom cards to graveyard face down", (count) => callbacks.onLibraryToZone({ count, faceDown: true, position: "bottom", to: "graveyard" })) },
    { label: "Move bottom card to exile", disabled: !hasCards, onSelect: () => callbacks.onLibraryToZone({ count: 1, position: "bottom", to: "exile" }) },
    { label: "Move bottom cards to exile...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Move bottom cards to exile", (count) => callbacks.onLibraryToZone({ count, position: "bottom", to: "exile" })) },
    { label: "Move bottom cards to exile face down...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Move bottom cards to exile face down", (count) => callbacks.onLibraryToZone({ count, faceDown: true, position: "bottom", to: "exile" })) },
    { label: "Shuffle bottom cards...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Shuffle bottom cards", (count) => callbacks.onShuffle({ count, position: "bottom" })) },
  ];

  return [
    { label: "Draw card", disabled: !hasCards, onSelect: () => callbacks.onDraw(1) },
    { label: "Draw cards...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("Draw cards", (count) => callbacks.onDraw(count)) },
    { label: "Undo last draw", onSelect: callbacks.onUndo },
    { label: "Shuffle", disabled: !hasCards, onSelect: () => callbacks.onShuffle() },
    { label: "View library", disabled: !hasCards, onSelect: () => callbacks.onViewZone({ zone: "library" }) },
    { label: "View top cards of library...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("View top cards of library", (count) => callbacks.onViewZone({ count, position: "top", zone: "library" })) },
    { label: "View bottom cards of library...", disabled: !hasCards, onSelect: () => callbacks.onPromptForCount("View bottom cards of library", (count) => callbacks.onViewZone({ count, position: "bottom", zone: "library" })) },
    { label: "Reveal library to...", disabled: revealLibraryItems.length === 0, children: revealLibraryItems },
    { label: "Reveal top cards to...", disabled: revealTopItems.length === 0, children: revealTopItems },
    { label: "Always reveal top card", checked: flags.alwaysRevealTop, onSelect: () => callbacks.onSetLibraryFlag("always-reveal-top", !flags.alwaysRevealTop) },
    { label: "Always look at top card", checked: flags.alwaysLookAtTop, onSelect: () => callbacks.onSetLibraryFlag("always-look-at-top", !flags.alwaysLookAtTop) },
    { label: "Top of library...", disabled: !hasCards, children: topLibraryItems },
    { label: "Bottom of library...", disabled: !hasCards, children: bottomLibraryItems },
    { label: "Open deck in deck editor", onSelect: callbacks.onOpenDeckEditor },
  ];
}

function buildGraveyardFieldContextMenuItems(
  zoneCount: number,
  isOwner: boolean,
  targets: PlayerView[],
  callbacks: ZoneFieldMenuCallbacks,
): ContextMenuItem[] {
  const revealRandomItems = buildTargetItems(
    targets,
    (targetPlayerId) => ({
      label: targetPlayerId === "all" ? "All players" : "",
      disabled: zoneCount === 0,
      onSelect: () => callbacks.onRevealRandomCard({ targetPlayerId, zone: "graveyard" }),
    }),
    true,
  );

  return [
    {
      label: "View graveyard",
      onSelect: () => callbacks.onViewZone({ zone: "graveyard" }),
    },
    ...(isOwner
      ? [
          {
            label: "Reveal random card to...",
            children: revealRandomItems,
            disabled: revealRandomItems.length === 0 || zoneCount === 0,
          },
          {
            label: "Move graveyard to...",
            disabled: zoneCount === 0,
            children: [
              {
                label: "Top of library",
                onSelect: () => callbacks.onMoveZone({ from: "graveyard", to: "library", toPosition: "top" }),
              },
              {
                label: "Bottom of library",
                onSelect: () => callbacks.onMoveZone({ from: "graveyard", to: "library", toPosition: "bottom" }),
              },
              {
                label: "Battlefield",
                onSelect: () => callbacks.onMoveZone({ from: "graveyard", to: "battlefield" }),
              },
              {
                label: "Hand",
                onSelect: () => callbacks.onMoveZone({ from: "graveyard", to: "hand" }),
              },
              {
                label: "Exile",
                onSelect: () => callbacks.onMoveZone({ from: "graveyard", to: "exile" }),
              },
            ],
          },
        ]
      : []),
  ];
}

function buildExileFieldContextMenuItems(
  zoneCount: number,
  isOwner: boolean,
  callbacks: ZoneFieldMenuCallbacks,
): ContextMenuItem[] {
  return [
    {
      label: "View exile",
      onSelect: () => callbacks.onViewZone({ zone: "exile" }),
    },
    ...(isOwner
      ? [
          {
            label: "Move exile to...",
            disabled: zoneCount === 0,
            children: [
              {
                label: "Battlefield",
                onSelect: () => callbacks.onMoveZone({ from: "exile", to: "battlefield" }),
              },
              {
                label: "Top of library",
                onSelect: () => callbacks.onMoveZone({ from: "exile", to: "library", toPosition: "top" }),
              },
              {
                label: "Bottom of library",
                onSelect: () => callbacks.onMoveZone({ from: "exile", to: "library", toPosition: "bottom" }),
              },
              {
                label: "Hand",
                onSelect: () => callbacks.onMoveZone({ from: "exile", to: "hand" }),
              },
              {
                label: "Graveyard",
                onSelect: () => callbacks.onMoveZone({ from: "exile", to: "graveyard" }),
              },
            ],
          },
        ]
      : []),
  ];
}

function buildSideboardFieldContextMenuItems(
  zoneCount: number,
  isOwner: boolean,
  callbacks: ZoneFieldMenuCallbacks,
): ContextMenuItem[] {
  if (!isOwner) {
    return [];
  }

  return [
    {
      label: "View sideboard",
      disabled: zoneCount === 0,
      onSelect: () => callbacks.onViewZone({ zone: "sideboard" }),
    },
  ];
}

function buildHandFieldContextMenuItems(
  zoneCount: number,
  libraryCount: number,
  isOwner: boolean,
  targets: PlayerView[],
  callbacks: ZoneFieldMenuCallbacks,
): ContextMenuItem[] {
  if (!isOwner) {
    return [];
  }

  const revealHandItems = buildTargetItems(
    targets,
    (targetPlayerId) => ({
      label: targetPlayerId === "all" ? "All players" : "",
      disabled: zoneCount === 0,
      onSelect: () => callbacks.onRevealZone({ targetPlayerId, zone: "hand" }),
    }),
    true,
  );
  const revealRandomItems = buildTargetItems(
    targets,
    (targetPlayerId) => ({
      label: targetPlayerId === "all" ? "All players" : "",
      disabled: zoneCount === 0,
      onSelect: () => callbacks.onRevealRandomCard({ targetPlayerId, zone: "hand" }),
    }),
    true,
  );
  const canMulligan = zoneCount > 0 || libraryCount > 0;

  return [
    {
      label: "View hand",
      disabled: zoneCount === 0,
      onSelect: () => callbacks.onViewZone({ zone: "hand" }),
    },
    {
      label: "Sort hand by...",
      disabled: zoneCount < 2,
      children: [
        { label: "Name", onSelect: () => callbacks.onSortHand("name") },
        { label: "Type", onSelect: () => callbacks.onSortHand("type") },
        { label: "Mana Value", onSelect: () => callbacks.onSortHand("mana-value") },
      ],
    },
    {
      label: "Reveal hand to...",
      disabled: revealHandItems.length === 0 || zoneCount === 0,
      children: revealHandItems,
    },
    {
      label: "Reveal random card to...",
      disabled: revealRandomItems.length === 0 || zoneCount === 0,
      children: revealRandomItems,
    },
    {
      label: "Take mulligan (Choose hand size)",
      disabled: !canMulligan || zoneCount === 0,
      onSelect: () => callbacks.onPromptForCount(
        "Take mulligan",
        (count) => callbacks.onTakeMulligan(count),
        { defaultValue: String(zoneCount), min: 0 },
      ),
    },
    {
      label: "Take mulligan (Same hand size)",
      disabled: !canMulligan || zoneCount === 0,
      onSelect: () => callbacks.onTakeMulligan(zoneCount),
    },
    {
      label: "Take mulligan (Hand size - 1)",
      disabled: !canMulligan || zoneCount === 0,
      onSelect: () => callbacks.onTakeMulligan(Math.max(0, zoneCount - 1)),
    },
    {
      label: "Move hand to...",
      disabled: zoneCount === 0,
      children: [
        {
          label: "Top of library",
          onSelect: () => callbacks.onMoveZone({ from: "hand", to: "library", toPosition: "top" }),
        },
        {
          label: "Bottom of library",
          onSelect: () => callbacks.onMoveZone({ from: "hand", to: "library", toPosition: "bottom" }),
        },
        {
          label: "Graveyard",
          onSelect: () => callbacks.onMoveZone({ from: "hand", to: "graveyard" }),
        },
        {
          label: "Exile",
          onSelect: () => callbacks.onMoveZone({ from: "hand", to: "exile" }),
        },
      ],
    },
  ];
}

export function buildZoneFieldContextMenuItems({
  flags,
  isOwner,
  libraryCallbacks,
  libraryCount,
  otherPlayers,
  zoneCallbacks,
  zone,
  zoneCount,
}: ZoneFieldMenuContext): ContextMenuItem[] {
  switch (zone) {
    case "library":
      return buildLibraryContextMenuItems(libraryCount, flags, otherPlayers, libraryCallbacks);
    case "graveyard":
      return buildGraveyardFieldContextMenuItems(zoneCount, isOwner, otherPlayers, zoneCallbacks);
    case "exile":
      return buildExileFieldContextMenuItems(zoneCount, isOwner, zoneCallbacks);
    case "hand":
      return buildHandFieldContextMenuItems(zoneCount, libraryCount, isOwner, otherPlayers, zoneCallbacks);
    case "sideboard":
      return buildSideboardFieldContextMenuItems(zoneCount, isOwner, zoneCallbacks);
    default:
      return [];
  }
}
