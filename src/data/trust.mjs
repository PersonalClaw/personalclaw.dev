// Home's trust rows (#88): each claim, the kind of evidence behind it, and the release it was last
// checked against. The shape is the verification ledger's (#93), which will own these rows; until it
// lands, Home carries them here.
//
// Two rows are /compare rows, read through src/data/capabilities.mjs, so their wording and their
// release are the matrix's own and nothing here restates them. The other two were checked by hand
// against the release named in `verified`. A re-pin moves releaseFacts.core to a new release, and
// trustRows() then refuses to build until someone re-reads those two at the new pin and moves
// `verified`: a row must never claim a release nobody checked.

import { capabilityMatrix, ledgerRow } from "./capabilities.mjs";

/** Checked by hand: the release's assets, and the synced threat model. */
const HAND_CHECKED = [
  {
    id: "sbom",
    claim: "The release attaches SBOMs for the wheel and both container images.",
    evidence: "Release assets",
    verified: "v0.3.0",
    link: (core) => ({ href: core.source.tagUrl ?? core.source.commitUrl, label: `The ${core.versionLabel} release` })
  },
  {
    id: "threat-model",
    claim: "A threat model maps each control to the OWASP Agentic Top 10.",
    evidence: "Threat model",
    verified: "v0.3.0",
    link: () => ({
      href: "/docs/security/threat-model#owasp-agentic-security-asi-top-10-mapping",
      label: "The OWASP mapping"
    })
  }
];

/** /compare rows, by id, in the order Home shows them after the hand-checked rows. */
const FROM_COMPARE = [
  { id: "telemetry", evidence: "Comparison row" },
  { id: "license", evidence: "License file" }
];

/**
 * @param {{ versionLabel: string, source: { tagUrl: string | null, commitUrl: string, repositoryUrl: string, commit: string } }} core
 *   releaseFacts.core
 */
export function trustRows(core) {
  const stale = HAND_CHECKED.filter((row) => row.verified !== core.versionLabel);
  if (stale.length > 0) {
    throw new Error(
      `src/data/trust.mjs: ${stale.map((row) => row.id).join(", ")} were checked at ` +
        `${stale[0].verified}, but the site now pins core ${core.versionLabel}. Re-check each ` +
        "claim at the new release, then move its `verified`."
    );
  }

  const matrix = capabilityMatrix();
  const verdicts = matrix.verdicts;
  const compared = FROM_COMPARE.map(({ id, evidence }) => {
    // Refuses a row not verified at the pin, or one that doesn't list Home among its surfaces.
    const row = ledgerRow(id, "home", matrix);
    // LICENSE at the pinned commit, not the tag the matrix links: the same file, by the pin rule.
    const href =
      id === "license"
        ? `${core.source.repositoryUrl}/blob/${core.source.commit}/LICENSE`
        : `/compare#${row.id}`;
    return {
      id,
      claim: row.claim,
      verdict: verdicts[row.verdict]?.label ?? row.verdict,
      evidence,
      href,
      label: id === "license" ? "LICENSE" : `The ${row.id} row`,
      verified: row.verifiedRelease
    };
  });

  return [
    ...HAND_CHECKED.map(({ id, claim, evidence, verified, link }) => ({
      id,
      claim,
      verdict: null,
      evidence,
      ...link(core),
      verified
    })),
    ...compared
  ];
}
