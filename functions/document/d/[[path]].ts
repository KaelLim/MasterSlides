// Redirect helper: pasted Google Docs URLs land here. /document/d/<id>(/...)
// becomes /?src=<id>.
//
// We had this as a _redirects rule, but CF Pages doesn't expand
// :placeholder substitutions when the source matched a query string or
// extra path segment in the same line — Google Docs URLs like
// /document/d/<id>/edit?tab=t.0 always blew through as a literal :id.
// A Function path is unambiguous.

export const onRequest: PagesFunction<unknown, "path"> = ({ params }) => {
  const segs = Array.isArray(params.path) ? params.path : [];
  const id = segs[0] || "";
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response("Bad doc id", { status: 400 });
  }
  // Workers' Response.redirect() insists on an absolute URL, but a
  // same-origin Location header is plenty for the browser. Hand-build
  // the response so we don't have to reconstruct the origin.
  return new Response(null, {
    status: 302,
    headers: { Location: `/?src=${encodeURIComponent(id)}` },
  });
};
