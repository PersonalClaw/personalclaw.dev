// Each page's social image (#97): its own frame where it has one, its section's frame where it
// does not, and the site's card (./social-card.ts) for a page in no section with a frame.
//
// The frames are rendered by scripts/render-social-frames.mjs, which writes ./social-frames.json
// beside this file and commits it with the PNGs. This module reads only that committed JSON, the
// card and ./section-frame.mjs, so it stays as safe to import from astro.config.mjs as
// ./social-card.ts is: nothing here reads `.generated/`, which a clean checkout does not have
// until `npm run sync`.

import { frameFor } from "./section-frame.mjs";
import frames from "./social-frames.json";
import { SOCIAL_IMAGE_ALT, SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_PATH, SOCIAL_IMAGE_WIDTH } from "./social-card";

/** What a page's head declares about its social image. The size is the PNG's real size. */
export interface SocialImage {
  path: string;
  width: string;
  height: string;
  alt: string;
}

/** The site's card: the image of a page that has no frame and is in no section with one. */
export const SITE_CARD: SocialImage = {
  path: SOCIAL_IMAGE_PATH,
  width: SOCIAL_IMAGE_WIDTH,
  height: SOCIAL_IMAGE_HEIGHT,
  alt: SOCIAL_IMAGE_ALT
};

const byRoute: Record<string, { image: string; width: number; height: number; alt: string }> = frames;

/**
 * The image a page at *pathname* declares: the route's frame, else the frame of its section
 * (`/registry/<app>` takes `/registry`'s, every `/docs/…` page takes `/docs`'s), else the card.
 */
export function socialImageFor(pathname: string): SocialImage {
  const frame = frameFor(byRoute, pathname);
  if (!frame) return SITE_CARD;
  return { path: frame.image, width: String(frame.width), height: String(frame.height), alt: frame.alt };
}
