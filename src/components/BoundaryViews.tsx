import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";

type Zone = { id: string; name: string; holds: string };
type View = { id: string; label: string; summary: string; layout?: string; hub?: string; zones: Zone[] };
type Crossing = { id: string; view: string; crossing: string; status: string };

// The boundary, drawn two ways: Authority (who decides what runs) and Network (where data goes).
// Authority is a line: its zones in order, with the boundary between two zones drawn as the line
// it is and labelled by what holds there. Network is a hub: every one of its boundaries is between
// the gateway on your machine and one thing outside it, so it is drawn as spokes off that zone, and
// no crossing sits between two outer zones as if traffic passed through one to reach the other.
// Each label opens its row in the page's table, which reads the boundary in full with its evidence
// and its limit, so this map adds no claim the table does not carry.
//
// The selected view lives in the URL as `?view=<id>`, as the System Window's does (H11 in
// docs/site-audit.md): a reload, back and forward, and a copied link open the same view. Choosing
// a view replaces the URL rather than adding a history entry. The first view is the default and
// leaves no parameter; a missing or unknown id opens it.
const VIEW_PARAM = "view";

function viewInUrl(views: View[]): number {
  const id = new URLSearchParams(window.location.search).get(VIEW_PARAM);
  const index = views.findIndex((view) => view.id === id);
  return index >= 0 ? index : 0;
}

function ZoneText({ zone }: { zone: Zone }) {
  return (
    <>
      <strong>{zone.name}</strong>
      <span>{zone.holds}</span>
    </>
  );
}

function CrossingLabel({ crossing, statusLabels }: { crossing: Crossing; statusLabels: Record<string, string> }) {
  return (
    <>
      <span className="boundary-line" aria-hidden="true" />
      <a className="boundary-label" href={`#boundary-${crossing.id}`}>
        <strong>{crossing.crossing}</strong>
        <span>{statusLabels[crossing.status] ?? crossing.status}</span>
      </a>
    </>
  );
}

export function BoundaryViews({
  views,
  crossings,
  statusLabels
}: {
  views: View[];
  crossings: Crossing[];
  statusLabels: Record<string, string>;
}) {
  // The server renders the default view; the URL's is read once the island runs.
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = views[activeIndex];
  const between = crossings.filter((crossing) => crossing.view === active.id);
  const hub = active.layout === "hub" ? active.zones.find((zone) => zone.id === active.hub) : undefined;

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
    <div className="boundary-views">
      <div className="boundary-tabs" role="tablist" aria-label="Draw the boundary by">
        {views.map((view, index) => (
          <button
            key={view.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            id={`boundary-tab-${view.id}`}
            role="tab"
            aria-selected={index === activeIndex}
            aria-controls="boundary-panel"
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeys(event, index)}
          >
            {view.label}
          </button>
        ))}
      </div>

      <div className="boundary-panel" id="boundary-panel" role="tabpanel" aria-labelledby={`boundary-tab-${active.id}`}>
        <p className="boundary-summary">{active.summary}</p>
        {hub ? (
          <div className="boundary-hub" data-view={active.id}>
            <div className="boundary-zone boundary-hub-zone">
              <ZoneText zone={hub} />
            </div>
            <ul className="boundary-spokes" role="list">
              {active.zones
                .filter((zone) => zone !== hub)
                .map((zone, index) =>
                  between[index] ? (
                    <li className="boundary-spoke" key={zone.id}>
                      <div className="boundary-crossing" data-status={between[index].status}>
                        <CrossingLabel crossing={between[index]} statusLabels={statusLabels} />
                      </div>
                      <div className="boundary-zone">
                        <ZoneText zone={zone} />
                      </div>
                    </li>
                  ) : null
                )}
            </ul>
          </div>
        ) : (
          <ol className="boundary-map" data-view={active.id} role="list">
            {active.zones.map((zone, index) => (
              <Fragment key={zone.id}>
                <li className="boundary-zone">
                  <ZoneText zone={zone} />
                </li>
                {between[index] && (
                  <li className="boundary-crossing" data-status={between[index].status}>
                    <CrossingLabel crossing={between[index]} statusLabels={statusLabels} />
                  </li>
                )}
              </Fragment>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
