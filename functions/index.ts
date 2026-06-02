// Smart router for `/` — if a viewer query is present (legacy bookmark from
// the days when the viewer lived at root), forward it to /slides/. Otherwise
// fall through to _redirects, which sends bare `/` to `/admin/`.
export const onRequest: PagesFunction = ({ request, next }) => {
  const url = new URL(request.url);
  if (url.searchParams.has("src") || url.searchParams.has("playlist")) {
    const target = new URL(`/slides/${url.search}`, url.origin);
    return Response.redirect(target.toString(), 302);
  }
  return next();
};
