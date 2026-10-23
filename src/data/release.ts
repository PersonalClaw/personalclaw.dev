import generatedFacts from "../../.generated/release-facts.json";
import { apps, type DirectoryApp } from "./apps";

export type ReleaseChannel = "pre-release" | "released";

export type SourceFact = {
  repository: string;
  repositoryUrl: string;
  commit: string;
  shortCommit: string;
  commitUrl: string;
  tag: string | null;
  tagUrl: string | null;
};

export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogEntry = {
  heading: string;
  date: string | null;
  summary: string;
  sections: ChangelogSection[];
};

/** One of the newest releases in the pinned changelog, newest first (latestReleases()). */
export type ChangelogRelease = Pick<ChangelogEntry, "heading" | "date" | "summary">;

/** An asset of the pinned core release, as GitHub's release record holds it. */
export type ReleaseAsset = {
  name: string;
  size: number;
  /** GitHub's SHA-256 digest of the uploaded bytes. */
  sha256: string;
  url: string;
  sbom: boolean;
  /** Core's release workflow attests build provenance for it. */
  attested: boolean;
};

/** The pinned core release, and the steps that verify its wheel (scripts/release-assets.mjs). */
export type CoreRelease = {
  url: string;
  assets: ReleaseAsset[];
  steps: {
    file: string;
    sha256: string;
    download: string;
    checksumMac: string;
    checksumLinux: string;
    attestation: string;
    install: string;
  };
};

export type ReleaseFacts = {
  schemaVersion: number;
  generatedAt: string;
  channel: ReleaseChannel;
  status: {
    label: string;
    summary: string;
  };
  core: {
    version: string;
    versionLabel: string;
    source: SourceFact;
    /** Null for a core pinned by commit alone. */
    release: CoreRelease | null;
    changelog: {
      currentVersion: ChangelogEntry;
      unreleased: ChangelogEntry;
      latest: ChangelogRelease[];
    };
  };
  apps: {
    total: number;
    categoryCount: number;
    categories: Array<{ name: string; apps: number }>;
    capabilityCount: number;
    capabilities: Array<{ id: string; name: string; apps: number }>;
    manifests: Array<{ name: string; version: string; category: string }>;
    source: SourceFact;
  };
};

const releaseFacts = generatedFacts as ReleaseFacts;
const publicApps = new Set(apps.map((app) => app.slug));
const sourceCategories = new Map(
  releaseFacts.apps.manifests.map((app) => [app.name, app.category])
);
const drift = [
  ...[...publicApps]
    .filter((name) => !sourceCategories.has(name))
    .map((name) => `${name} is not in the pinned apps source`),
  ...[...sourceCategories.keys()]
    .filter((name) => !publicApps.has(name))
    .map((name) => `${name} is missing from the public app directory`)
];

if (drift.length > 0 || publicApps.size !== releaseFacts.apps.total) {
  throw new Error(`Public app directory drifted from pinned manifests:\n${drift.join("\n")}`);
}

/** Every curated entry, filed under the category its pinned manifest has, in name
    order: the reader scans names, and a slug can sort far from its name
    ("watched-source-github" is "GitHub Repo Watcher"). */
const directoryApps: DirectoryApp[] = apps
  .map((app) => ({ ...app, category: sourceCategories.get(app.slug)! }))
  .sort((left, right) => left.name.localeCompare(right.name, "en"));

export { directoryApps, releaseFacts };
