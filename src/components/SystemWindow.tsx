import { useRef, useState, type KeyboardEvent } from "react";

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

export function SystemWindow({ views }: { views: View[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = views[activeIndex];

  const choose = (index: number) => {
    setActiveIndex(index);
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
              onClick={() => setActiveIndex(index)}
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
        className="system-frame"
        id="system-panel"
        role="tabpanel"
        aria-labelledby={`tab-${active.id}`}
      >
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
        <div className="system-caption">
          <p>{active.title}</p>
          <span>{active.description}</span>
        </div>
      </div>
    </div>
  );
}
