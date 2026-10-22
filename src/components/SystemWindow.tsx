import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type View = {
  id: string;
  label: string;
  title: string;
  description: string;
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
};

// The selected view lives in the URL as `?view=<id>`, so a reload, back and forward, and a
// copied link all open the same view (H11 in docs/site-audit.md). Choosing a view replaces the
// URL rather than adding a history entry: Back leaves the page, as it did, instead of stepping
// through tabs. The first view is the default and leaves no parameter; a missing or unknown id
// opens it.
const VIEW_PARAM = "view";

function viewInUrl(views: View[]): number {
  const id = new URLSearchParams(window.location.search).get(VIEW_PARAM);
  const index = views.findIndex((view) => view.id === id);
  return index >= 0 ? index : 0;
}

export function SystemWindow({ views }: { views: View[] }) {
  // The server renders the default view; the URL's is read once the island runs.
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = views[activeIndex];

  useEffect(() => {
    const follow = () => setActiveIndex(viewInUrl(views));
    follow();
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, [views]);

  const select = (index: number) => {
    setActiveIndex(index);
    const url = new URL(window.location.href);
    if (index === 0) url.searchParams.delete(VIEW_PARAM);
    else url.searchParams.set(VIEW_PARAM, views[index].id);
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
    if (event.key === "End") return choose(views.length - 1);

    const delta = event.key === "ArrowRight" ? 1 : -1;
    choose((index + delta + views.length) % views.length);
  };

  return (
    <div className="system-window">
      <div className="system-window-bar">
        <div className="window-controls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="system-tabs" role="tablist" aria-label="Explore PersonalClaw">
          {views.map((view, index) => (
            <button
              key={view.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              id={`tab-${view.id}`}
              role="tab"
              aria-selected={index === activeIndex}
              aria-controls="system-panel"
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => handleKeys(event, index)}
            >
              {view.label}
            </button>
          ))}
        </div>
        <span className="window-status">
          <span aria-hidden="true" />
          Local
        </span>
      </div>

      <div
        className="system-panel"
        id="system-panel"
        role="tabpanel"
        aria-labelledby={`tab-${active.id}`}
      >
        <div className="system-frame">
          <img
            key={active.id}
            className="system-image is-active"
            src={active.src}
            srcSet={active.srcSet}
            sizes={active.sizes}
            width={active.width}
            height={active.height}
            alt={`${active.label} view in the PersonalClaw dashboard`}
            loading="eager"
            fetchPriority={activeIndex === 0 ? "high" : "auto"}
          />
        </div>
        <div className="system-caption">
          <p>{active.title}</p>
          <span>{active.description}</span>
        </div>
      </div>
    </div>
  );
}
