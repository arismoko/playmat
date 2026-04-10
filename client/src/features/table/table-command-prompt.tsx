import { useEffect, useState } from "react";

export type TableCommandPromptState = {
  defaultValue: string;
  inputMode: "number" | "text";
  label: string;
  title: string;
  onSubmit: (value: string) => void;
};

type TableCommandPromptProps = {
  onCancel: () => void;
  prompt: TableCommandPromptState;
};

export function TableCommandPrompt({ onCancel, prompt }: TableCommandPromptProps) {
  const [value, setValue] = useState(prompt.defaultValue);

  useEffect(() => {
    setValue(prompt.defaultValue);
  }, [prompt.defaultValue, prompt.title]);

  return (
    <div className="game-table-overlay" onClick={onCancel} role="presentation">
      <form
        className="game-table-dialog game-table-command-dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          prompt.onSubmit(value);
        }}
      >
        <header className="game-table-dialog-header">
          <div>
            <strong className="game-table-dialog-title">{prompt.title}</strong>
          </div>
        </header>

        <label className="game-table-dialog-field">
          <span>{prompt.label}</span>
          <input
            autoFocus
            inputMode={prompt.inputMode === "number" ? "numeric" : "text"}
            type={prompt.inputMode === "number" ? "number" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>

        <div className="game-table-dialog-actions">
          <button className="button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button button-primary" type="submit">
            Confirm
          </button>
        </div>
      </form>
    </div>
  );
}
