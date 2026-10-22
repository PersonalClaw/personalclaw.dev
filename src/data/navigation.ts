/**
 * Where a navigation link stands to the page the reader is on, as `aria-current`: `"page"` on
 * the page itself, `"true"` on a page inside the link's section (`/blog/launch` under Blog, an
 * app's listing under Registry), and nothing otherwise. Marking only an exact path left every
 * page below a section index with no current mark (X9 in docs/site-audit.md).
 *
 * `pathname` is the page's path without a trailing slash ("/" for Home), as BaseLayout passes it.
 */
export function currentOf(pathname: string, href: string): "page" | "true" | undefined {
  if (href === pathname) return "page";
  if (href !== "/" && pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}
