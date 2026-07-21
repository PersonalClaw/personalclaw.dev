import generatedFacts from "../../.generated/release-facts.json";
import { apps } from "./apps";

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
    changelog: {
      currentVersion: ChangelogEntry;
      unreleased: ChangelogEntry;
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
const publicApps = new Map(apps.map((app) => [app.slug, app.category]));
const sourceApps = new Map(
  releaseFacts.apps.manifests.map((app) => [app.name, app.category])
);
const drift = [
  ...[...publicApps].flatMap(([name, category]) => {
    const sourceCategory = sourceApps.get(name);
    if (sourceCategory == null) return [`${name} is not in the pinned apps source`];
    if (sourceCategory !== category) {
      return [`${name} is ${sourceCategory} in source but ${category} on the website`];
    }
    return [];
  }),
  ...[...sourceApps.keys()]
    .filter((name) => !publicApps.has(name))
    .map((name) => `${name} is missing from the public app directory`)
];

if (drift.length > 0 || publicApps.size !== releaseFacts.apps.total) {
  throw new Error(`Public app directory drifted from pinned manifests:\n${drift.join("\n")}`);
}

export { releaseFacts };
