import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

/** A command in a well with a copy button. `label` names the command ("Download command"). */
export function CopyCommand({ command, label = "Install command" }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const lowered = label.charAt(0).toLowerCase() + label.slice(1);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
  };

  return (
    <div className="command-block">
      <code tabIndex={0} aria-label={label}>
        {command.split("\n").map((line) => (
          <span className="command-line" key={line}>
            <span className="prompt" aria-hidden="true">$</span> {line}
          </span>
        ))}
      </code>
      <button
        className="icon-button copy-button"
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${lowered}`}
      >
        {copied ? <Check size={19} aria-hidden="true" /> : <Copy size={19} aria-hidden="true" />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${label} copied` : ""}
      </span>
    </div>
  );
}
