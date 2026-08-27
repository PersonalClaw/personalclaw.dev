import { ArrowUpRight, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { appFacts } from "../data/apps";
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
        // The derived facts are searchable text too. They used to reach this haystack
        // only for the apps that happened to also carry the matching tag, so "keyless"
        // found 3 of the 9 keyless apps; it now finds all 9.
        `${app.name} ${app.description} ${appFacts(app).join(" ")} ${app.tags.join(" ")}`
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
                {/* Declared facts lead, and are budgeted separately from `tags` on
                    purpose: a badge must never be the reason a real capability tag gets
                    sliced off. */}
                {appFacts(app).map((fact) => (
                  <li key={fact} className="app-fact">
                    {fact}
                  </li>
                ))}
                {/* 🔴 THIS USED TO BE `tags.slice(0, 4)`, and the comment right above it already said why
                    that was wrong: "a badge must never be the reason a real capability tag gets sliced
                    off." The cap it kept did the slicing anyway — on exactly one app. Censused across all
                    39: `openrouter-models` is the only one with five tags, so the cap's entire effect was
                    to drop its `Video`, silently, while `app.tags.join(" ")` above puts Video in the
                    SEARCH haystack. A user could find this app by searching "video" and then not see why.
                    Uncapped, the widest card in the catalogue is 5 pills — the same card — so removing the
                    slice adds one pill to one card and changes nothing else. The bound did not disappear:
                    it moved to a build-time assertion in tests/browser/interactions.spec.ts, so a future
                    app with more tags than a card can show fails the gate instead of losing a capability
                    without saying so. */}
                {app.tags.map((tag) => (
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
