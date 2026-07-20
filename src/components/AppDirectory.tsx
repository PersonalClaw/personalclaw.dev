import { ArrowUpRight, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { App, AppCategory } from "../data/apps";

type Category = "All" | AppCategory;

export function AppDirectory({
  apps,
  categories
}: {
  apps: App[];
  categories: Category[];
}) {
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [initialized, setInitialized] = useState(false);
  const searchId = useId();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryParam = params.get("q") ?? "";
    const categoryParam = params.get("category");
    const validCategory = categories.find(
      (item) => item.toLowerCase() === categoryParam?.toLowerCase()
    );

    setQuery(queryParam);
    setCategory(validCategory ?? "All");
    setInitialized(true);
  }, [categories]);

  useEffect(() => {
    if (!initialized) return;

    const url = new URL(window.location.href);
    query ? url.searchParams.set("q", query) : url.searchParams.delete("q");
    category === "All"
      ? url.searchParams.delete("category")
      : url.searchParams.set("category", category.toLowerCase());
    window.history.replaceState({}, "", url);
  }, [category, initialized, query]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return apps.filter((app) => {
      const inCategory = category === "All" || app.category === category;
      const matchesQuery =
        !normalized ||
        `${app.name} ${app.description} ${app.tags.join(" ")}`
          .toLowerCase()
          .includes(normalized);
      return inCategory && matchesQuery;
    });
  }, [apps, category, query]);

  return (
    <div className="app-directory">
      <div className="directory-tools">
        <div className="search-field">
          <label className="sr-only" htmlFor={searchId}>
            Search first-party apps
          </label>
          <Search size={19} aria-hidden="true" />
          <input
            id={searchId}
            name="app-search"
            type="search"
            value={query}
            placeholder="Search apps…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              className="search-clear"
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="filter-scroll" role="group" aria-label="Filter apps by category">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={item === category ? "is-active" : ""}
              aria-pressed={item === category}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <p className="result-count" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "app" : "apps"}
      </p>

      {filtered.length > 0 ? (
        <div className="app-grid">
          {filtered.map((app) => (
            <a
              key={app.slug}
              className="app-card"
              href={`https://github.com/PersonalClaw/PersonalClawApps/tree/main/${app.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              <div className="app-card-head">
                <span className="app-category">{app.category}</span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </div>
              <h2>{app.name}</h2>
              <p>{app.description}</p>
              <ul aria-label={`${app.name} characteristics`}>
                {app.tags.slice(0, 4).map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No apps match those filters.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
