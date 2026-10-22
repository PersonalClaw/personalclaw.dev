import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { appFacts } from "../data/apps";
import type { DirectoryApp, DirectoryCategory } from "../data/apps";

const ALL = "All";

function appCount(count: number) {
  return `${count} ${count === 1 ? "app" : "apps"}`;
}

export function AppDirectory({
  apps,
  categories,
  treeBase
}: {
  apps: DirectoryApp[];
  /**
   * The categories in the release sync's order, each with the number of pinned manifests
   * filed under it. Passed in for the same reason as `treeBase`: the counts live in the
   * generated release facts, which this client island must not import.
   */
  categories: DirectoryCategory[];
  /**
   * The pinned-commit tree URL every card links into, ending in a slash. Passed in from
   * src/pages/apps.astro rather than built here, because the pin lives in the generated
   * release facts and this component is a client island that must not import them.
   *
   * It used to be a hardcoded `.../tree/main/${slug}`. That was 39 links into the apps
   * DEVELOPMENT branch on a page whose counts are all derived from the RELEASED commit —
   * so a bundle renamed or removed after the release gave a reader a 404 or, worse, a
   * manifest declaring a provider type the released core rejects.
   */
  treeBase: string;
}) {
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  // A `?category=` the catalog has no category for, kept to say so rather than quietly
  // showing every app under a filter the reader thinks is on.
  const [unknownCategory, setUnknownCategory] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const searchId = useId();
  const selectId = useId();
  const directory = useRef<HTMLDivElement>(null);

  const options = useMemo(
    () => [{ name: ALL, apps: apps.length }, ...categories],
    [apps.length, categories]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryParam = params.get("q") ?? "";
    const categoryParam = params.get("category");
    const validCategory = categories.find(
      (item) => item.name.toLowerCase() === categoryParam?.toLowerCase()
    );

    setQuery(queryParam);
    setCategory(validCategory?.name ?? ALL);
    setUnknownCategory(categoryParam && !validCategory ? categoryParam : null);
    setInitialized(true);
  }, [categories]);

  useEffect(() => {
    if (!initialized) return;

    const url = new URL(window.location.href);
    query ? url.searchParams.set("q", query) : url.searchParams.delete("q");
    category === ALL
      ? url.searchParams.delete("category")
      : url.searchParams.set("category", category.toLowerCase());
    window.history.replaceState({}, "", url);
  }, [category, initialized, query]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return apps.filter((app) => {
      const inCategory = category === ALL || app.category === category;
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

  // The search bar and the rail stay on screen while the grid scrolls under them, so a
  // filter can shrink the grid to one row from far down the page, leaving the reader
  // past the end of their results. Bring the results' top back into view first.
  function keepResultsInView() {
    const element = directory.current;
    if (element && element.getBoundingClientRect().top < 0) {
      element.scrollIntoView({ block: "start" });
    }
  }

  function choose(next: string) {
    keepResultsInView();
    setCategory(next);
    setUnknownCategory(null);
  }

  function search(next: string) {
    keepResultsInView();
    setQuery(next);
  }

  // The build fails before it ships an empty catalog (src/data/release.ts), so this is
  // the island's own guard: a directory with nothing in it says where the apps are
  // instead of offering a search over nothing.
  if (apps.length === 0) {
    return (
      <div className="app-directory">
        <div className="directory-notice">
          <p>The app catalog is not available in this build.</p>
          <a className="text-link" href={treeBase} target="_blank" rel="noreferrer">
            Browse the apps at the pinned commit
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="app-directory" ref={directory}>
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
            onChange={(event) => search(event.target.value)}
          />
          {query && (
            <button
              className="search-clear"
              type="button"
              aria-label="Clear search"
              onClick={() => search("")}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Narrow screens: one native control instead of a row of fifteen buttons that
            scrolls sideways. CSS shows this or the button group, never both. */}
        <div className="category-select">
          <label htmlFor={selectId}>Category</label>
          <div className="select-field">
            <select
              id={selectId}
              name="app-category"
              value={category}
              onChange={(event) => choose(event.target.value)}
            >
              {options.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.apps})
                </option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="directory-body">
        <div className="category-rail" role="group" aria-label="Filter apps by category">
          {options.map((item) => (
            <button
              key={item.name}
              type="button"
              aria-pressed={item.name === category}
              onClick={() => choose(item.name)}
            >
              <span>{item.name}</span>{" "}
              <span className="category-count">
                {item.apps}
                <span className="sr-only"> {item.apps === 1 ? "app" : "apps"}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="directory-results">
          {unknownCategory && (
            <p className="directory-notice directory-error" role="status">
              There is no “{unknownCategory}” category. Showing every category.
            </p>
          )}

          <p className="result-count" aria-live="polite">
            {appCount(filtered.length)}
          </p>

          {filtered.length > 0 ? (
            <div className="app-grid">
              {filtered.map((app) => (
                <article key={app.slug} className="app-card">
                  <h2>
                    <a href={`${treeBase}${app.slug}`} target="_blank" rel="noreferrer">
                      {app.name}
                    </a>
                  </h2>
                  <p className="app-category">{app.category}</p>
                  <p className="app-description">{app.description}</p>
                  {/* Declared facts lead, and are budgeted separately from `tags` on
                      purpose: a badge must never be the reason a real capability tag
                      gets sliced off. Text, not a list: a list per card put 69 lists
                      and their counts in front of a screen reader. The bound on how
                      many a card carries lives in tests/browser/interactions.spec.ts. */}
                  <p className="app-traits">
                    {[
                      ...appFacts(app).map((fact) => (
                        <span key={fact} className="app-fact">
                          {fact}
                        </span>
                      )),
                      ...app.tags.map((tag) => <span key={tag}>{tag}</span>)
                    ].flatMap((trait, index) => (index === 0 ? [trait] : [" ", trait]))}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No apps match those filters.</p>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  search("");
                  choose(ALL);
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
