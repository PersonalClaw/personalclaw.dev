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
              aria-controls={`panel-${view.id}`}
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
        id={`panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${active.id}`}
      >
        {views.map((view, index) => (
          <img
            key={view.id}
            className={`system-image ${index === activeIndex ? "is-active" : ""}`}
            src={view.src}
            srcSet={view.srcSet}
            sizes={view.sizes}
            width={view.width}
            height={view.height}
            alt={`${view.label} view in the PersonalClaw dashboard`}
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : "auto"}
            aria-hidden={index !== activeIndex}
          />
        ))}
        <div className="system-caption">
          <p>{active.title}</p>
          <span>{active.description}</span>
        </div>
      </div>
    </div>
  );
}
