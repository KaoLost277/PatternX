import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent, SyntheticEvent } from "react";
import type { ColumnValueFilter } from "./columnFilters";
import {
  hintTextClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
} from "./uiClasses";

type TextFilterMatch = "contains" | "exact";

type FilterDraft =
  | { kind: "text"; match: TextFilterMatch; value: string }
  | { kind: "missing" };

export interface ColumnFilterEditorTarget<Key extends string> {
  key: Key;
  label: string;
  trigger: HTMLButtonElement;
  filter: ColumnValueFilter | undefined;
  allowsMissing: boolean;
}

interface ColumnFilterEditorProps<Key extends string> {
  popoverId: string;
  target: ColumnFilterEditorTarget<Key> | null;
  onApply: (key: Key, filter: ColumnValueFilter) => void;
  onClear: (key: Key) => void;
  onClose: () => void;
}

function draftForFilter(filter: ColumnValueFilter | undefined): FilterDraft {
  if (filter === undefined) {
    return { kind: "text", match: "contains", value: "" };
  }
  if (filter.kind === "missing") {
    return { kind: "missing" };
  }
  return {
    kind: "text",
    match: filter.kind,
    value: filter.value,
  };
}

function positionForTrigger(trigger: HTMLButtonElement) {
  const triggerBounds = trigger.getBoundingClientRect();
  const popoverWidth = Math.min(320, window.innerWidth - 16);
  const left = Math.max(
    8,
    Math.min(triggerBounds.left, window.innerWidth - popoverWidth - 8),
  );
  const belowTrigger = triggerBounds.bottom + 8;
  const top =
    belowTrigger + 240 <= window.innerHeight - 8
      ? belowTrigger
      : Math.max(8, triggerBounds.top - 240);
  return { left, top };
}

export function ColumnFilterEditor<Key extends string>({
  popoverId,
  target,
  onApply,
  onClear,
  onClose,
}: ColumnFilterEditorProps<Key>) {
  const [draft, setDraft] = useState<FilterDraft>(() =>
    draftForFilter(target?.filter),
  );
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterMatchSelectRef = useRef<HTMLSelectElement>(null);
  const filterValueInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (target === null) {
      const filterPopover = filterPopoverRef.current;
      if (filterPopover?.matches(":popover-open")) {
        filterPopover.hidePopover();
      }
      return;
    }

    function closeFilterEditor() {
      const filterPopover = filterPopoverRef.current;
      if (filterPopover?.matches(":popover-open")) {
        filterPopover.hidePopover();
      }
      onClose();
    }

    window.addEventListener("scroll", closeFilterEditor, true);
    window.addEventListener("resize", closeFilterEditor);
    const animationFrame = window.requestAnimationFrame(() => {
      const filterPopover = filterPopoverRef.current;
      if (filterPopover !== null && !filterPopover.matches(":popover-open")) {
        filterPopover.showPopover();
      }
      if (filterPopoverRef.current?.matches(":popover-open")) {
        const valueInput = filterValueInputRef.current;
        if (valueInput !== null) {
          valueInput.focus();
        } else {
          filterMatchSelectRef.current?.focus();
        }
      }
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", closeFilterEditor, true);
      window.removeEventListener("resize", closeFilterEditor);
    };
  }, [onClose, target]);

  function closeFilterEditor() {
    const filterPopover = filterPopoverRef.current;
    if (filterPopover?.matches(":popover-open")) {
      filterPopover.hidePopover();
    }
    onClose();
  }

  function handleFilterPopoverToggled(event: SyntheticEvent<HTMLDivElement>) {
    const toggleEvent = event.nativeEvent;
    if (
      typeof ToggleEvent !== "undefined" &&
      toggleEvent instanceof ToggleEvent &&
      toggleEvent.newState === "closed"
    ) {
      onClose();
    }
  }

  function handleFilterMatchChanged(event: ChangeEvent<HTMLSelectElement>) {
    const nextMatch = event.currentTarget.value;
    if (nextMatch === "missing" && target?.allowsMissing === true) {
      setDraft({ kind: "missing" });
      return;
    }

    const match: TextFilterMatch = nextMatch === "exact" ? "exact" : "contains";
    const value = draft.kind === "text" ? draft.value : "";
    setDraft({ kind: "text", match, value });
  }

  function handleFilterValueChanged(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    setDraft((currentDraft) => {
      if (currentDraft.kind !== "text") {
        return currentDraft;
      }
      return { ...currentDraft, value };
    });
  }

  function handleFilterApplied(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (target === null) {
      return;
    }

    if (draft.kind === "missing") {
      onApply(target.key, { kind: "missing" });
    } else {
      if (draft.value.length === 0) {
        return;
      }
      onApply(target.key, { kind: draft.match, value: draft.value });
    }

    closeFilterEditor();
  }

  function handleFilterEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      target?.trigger.focus();
    }
  }

  const filterMatch = draft.kind === "missing" ? "missing" : draft.match;
  const filterValue = draft.kind === "text" ? draft.value : "";
  const filterValueInputHidden = draft.kind === "missing";
  const position = target === null ? null : positionForTrigger(target.trigger);

  return (
    <div
      ref={filterPopoverRef}
      className={`fixed inset-auto z-20 w-[min(20rem,calc(100vw-1rem))] gap-3 rounded-panel border border-border bg-surface p-4 text-text shadow-dialog ${target === null ? "hidden" : "grid"}`}
      style={
        position === null
          ? undefined
          : { left: `${position.left}px`, top: `${position.top}px` }
      }
      popover="auto"
      role="dialog"
      aria-labelledby={`${popoverId}-title`}
      onToggle={handleFilterPopoverToggled}
      onKeyDown={handleFilterEditorKeyDown}
    >
      <div className="grid min-w-0 gap-2">
        <h2 className="text-base font-semibold" id={`${popoverId}-title`}>
          Filter {target?.label ?? "column"}
        </h2>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-text-secondary">
          <span>Match type</span>
          <select
            ref={filterMatchSelectRef}
            className="min-h-10 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            value={filterMatch}
            aria-label={`Match type for ${target?.label ?? "column"}`}
            onChange={handleFilterMatchChanged}
          >
            <option value="contains">Contains</option>
            <option value="exact">Exactly matches</option>
            {target?.allowsMissing === true && (
              <option value="missing">Missing Value</option>
            )}
          </select>
        </label>
        {!filterValueInputHidden && (
          <label className="grid min-w-0 gap-1 text-sm font-medium text-text-secondary">
            <span>Value</span>
            <input
              ref={filterValueInputRef}
              type="search"
              value={filterValue}
              className="min-h-10 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              aria-label={`Value for ${target?.label ?? "column"} filter`}
              onChange={handleFilterValueChanged}
            />
          </label>
        )}
        <p className={hintTextClasses}>
          Contains ignores letter case. Exact matches preserve case and spacing. Missing Value
          matches values this table identifies as missing.
        </p>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={handleFilterApplied}>
        <button
          type="submit"
          className={primaryButtonClasses}
          disabled={target === null || (draft.kind === "text" && draft.value.length === 0)}
        >
          Apply filter
        </button>
        {target?.filter !== undefined && (
          <button
            type="button"
            className={secondaryButtonClasses}
            onClick={() => {
              if (target !== null) {
                onClear(target.key);
              }
              closeFilterEditor();
            }}
          >
            Clear this filter
          </button>
        )}
      </form>
    </div>
  );
}
