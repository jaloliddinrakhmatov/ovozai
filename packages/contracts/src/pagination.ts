import { z } from "zod";
import { pageInfoSchema } from "./common";

/**
 * Cursor-based list query (see docs/API.md §5). `limit` is coerced from the
 * query string and bounded to 1..100.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Wrap an item schema into the standard `{ data, pageInfo }` list envelope. */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    pageInfo: pageInfoSchema,
  });
}
