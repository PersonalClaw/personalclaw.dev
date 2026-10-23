import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Panel = { id: string; label: string };

// An install-safety sheet's evidence, one panel at a time: the manifest, the scan record, and
// the claims with their evidence. Each panel's content is rendered by the page (named slots), so
// every panel reads without JavaScript: until this island runs, all of them show, one after the
// other, and the tabs only label them.
//
// The selected panel lives in the URL as `?panel=<id>`, as the System Window's view and
// /security's view do: a reload, back and forward, and a copied link open the same panel. Choosing
// one replaces the URL rather than adding a history entry. The first panel is the default and
// leaves no parameter; a missing or unknown id opens it.
const PANEL_PARAM = "panel";

function panelInUrl(panels: Panel[]): string {
  const id = new URLSearchParams(window.location.search).get(PANEL_PARAM);
  return panels.some((panel) => panel.id === id) ? (id as string) : panels[0].id;
}

export function SheetEvidence({ panels, ...slots }: { panels: Panel[]; [slot: string]: unknown }) {
  // null until the island runs: the server renders every panel open.
  const [active, setActive] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shown = active ?? panels[0].id;

  useEffect(() => {
    const follow = () => setActive(panelInUrl(panels));
    follow();
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, [panels]);

  const select = (index: number) => {
    setActive(panels[index].id);
    const url = new URL(window.location.href);
    if (index === 0) url.searchParams.delete(PANEL_PARAM);
    else url.searchParams.set(PANEL_PARAM, panels[index].id);
    window.history.replaceState(window.history.state, "", url);
  };

  const choose = (index: number) => {
    select(index);
    tabRefs.current[index]?.focus();
  };

  const handleKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") return choose(0);
    if (event.key === "End") return choose(panels.length - 1);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    choose((index + delta + panels.length) % panels.length);
  };

  return (
    <div className="evidence">
      <div className="evidence-tabs" role="tablist" aria-label="Evidence">
        {panels.map((panel, index) => (
          <button
            key={panel.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            id={`evidence-tab-${panel.id}`}
            role="tab"
            aria-selected={panel.id === shown}
            aria-controls={`evidence-${panel.id}`}
            tabIndex={panel.id === shown ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeys(event, index)}
          >
            {panel.label}
          </button>
        ))}
      </div>
      {panels.map((panel) => (
        <section
          key={panel.id}
          className="evidence-panel"
          id={`evidence-${panel.id}`}
          role="tabpanel"
          aria-labelledby={`evidence-tab-${panel.id}`}
          data-panel={panel.id}
          hidden={active !== null && active !== panel.id}
          tabIndex={0}
        >
          {slots[panel.id] as ReactNode}
        </section>
      ))}
    </div>
  );
}
