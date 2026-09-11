/** Wraps an async route so a rejected promise reaches the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * The frontend calls the same URL two ways: with `pageNumber`/`pageSize` for a
 * table, and without them for a full list. The two answers have different
 * shapes, so every list route has to know which one was asked for.
 */
export const isPaged = (req) =>
  req.query.pageNumber !== undefined || req.query.pageSize !== undefined;

export const pageParams = (req) => {
  const pageNumber = Math.max(1, Number(req.query.pageNumber) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
  return { pageNumber, pageSize, skip: (pageNumber - 1) * pageSize };
};

/** The envelope `ITableResponseType` describes, passed through untouched. */
export const pagedResponse = ({ data, totalCount, pageNumber, pageSize }) => ({
  pageNumber,
  pageSize,
  totalCount,
  totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  data,
});

/** Sends either the paged envelope or the plain list shape a route declares. */
export const sendList = async ({ req, res, model, query = {}, key, sort = { createdAt: -1 }, populate = [], map = (doc) => doc }) => {
  const filter = query;

  if (isPaged(req)) {
    const { pageNumber, pageSize, skip } = pageParams(req);
    const [docs, totalCount] = await Promise.all([
      model.find(filter).sort(sort).skip(skip).limit(pageSize).populate(populate),
      model.countDocuments(filter),
    ]);
    return res.json(
      pagedResponse({
        data: docs.map(map),
        totalCount,
        pageNumber,
        pageSize,
      }),
    );
  }

  const docs = await model.find(filter).sort(sort).populate(populate);
  const list = docs.map(map);

  // Some list endpoints are read as a bare array by the frontend handler and
  // others as `{ count, <key> }`; `key` is what that handler unwraps.
  return res.json(key ? { count: list.length, [key]: list } : list);
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (message = "Not found") => new HttpError(404, message);
export const badRequest = (message = "Bad request") => new HttpError(400, message);
