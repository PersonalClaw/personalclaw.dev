// The tour's chapters: one still each, from the shots captured at the pinned release.
//
// The recorded tour came off /product at the 0.2.6 re-pin: it was cut at an earlier release and
// showed screens the app no longer has. Until it is recorded again, /product lists the same
// beats as chapters a visitor chooses, each showing the manifest shot of that screen, and the one
// chosen is kept in the URL (`?chapter=`). A chapter names a shot by its manifest id, so a shot
// that stops shipping fails the build (tests/tour-chapters.test.mjs) rather than leaving a
// chapter with an image nobody re-captured.

/** The query parameter that keeps the chosen chapter. */
export const CHAPTER_PARAM = "chapter";

/**
 * The chapters /product lists, in order: the manifest shot each shows, what the list calls it,
 * and the shot's text alternative.
 */
export const TOUR_CHAPTERS = Object.freeze([
  {
    id: "home",
    shot: "dashboard",
    label: "Home, and what waits on you",
    alt: "PersonalClaw's home: a tool approval, a goal loop's question and a skill proposal waiting on you, above the work running now and the threads finished recently."
  },
  {
    id: "chat",
    shot: "chat",
    label: "A chat stopped at its approval",
    alt: "A PersonalClaw chat that read the code and ran the tests, now waiting at a permission card for a file edit, with Allow and Deny."
  },
  {
    id: "approval",
    shot: "inbox",
    label: "Every approval in one inbox",
    alt: "PersonalClaw's inbox holding three kinds of item, a tool approval, a goal loop's question and a skill proposal, each with a link to where it came from."
  },
  {
    id: "loops",
    shot: "loops",
    label: "A goal loop and its report",
    alt: "A finished PersonalClaw goal loop: its goal, five cycles, the time and spend, and the report it left, with a summary and an evidence table citing files and lines."
  },
  {
    id: "knowledge",
    shot: "knowledge",
    label: "Knowledge, tagged and searchable",
    alt: "PersonalClaw's knowledge library: source documents, notes and bookmarks, each tagged, with counts of items, entities, relations and embedded entries."
  }
]);
