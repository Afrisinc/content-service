/**
 * Empty JSON Body Plugin
 * Lets a request with `Content-Type: application/json` and no body through as
 * an empty body instead of failing.
 */

import { FastifyInstance } from 'fastify';

export async function registerEmptyJsonBodyParser(app: FastifyInstance) {
  // Fastify's built-in JSON parser rejects an empty body outright with "Body
  // cannot be empty when content-type is set to 'application/json'" — axios
  // sends that header by default even on a body-less POST (e.g. an action
  // endpoint like duplicate/approve identified entirely by its URL), so every
  // such call failed before reaching the route handler. This overrides the
  // default parser to treat an empty body as `undefined` and otherwise parse
  // exactly as before, so a route with a required `body` schema still fails
  // validation the normal way if the body is actually missing.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const raw = body as string;
    if (raw.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      // Matches Fastify's own default parser: malformed JSON is a 400, not
      // the 500 a plain thrown SyntaxError would otherwise map to.
      (err as Error & { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });
}
