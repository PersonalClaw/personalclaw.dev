import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

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
      <code tabIndex={0} aria-label="Install command">
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
        aria-label={copied ? "Install command copied" : "Copy install command"}
      >
        {copied ? <Check size={19} aria-hidden="true" /> : <Copy size={19} aria-hidden="true" />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Install command copied" : ""}
      </span>
    </div>
  );
}
