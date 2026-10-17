/**
 * The route boundary: parse input, and map errors thrown by src/server/services to HTTP.
 * Every route follows the same shape:
 *
 *   export async function POST(request: Request, { params }: RouteContext<"/api/…">) {
 *     try {
 *       const { profile } = await requireOwnedProfile((await params).profileId);
 *       const input = await parseBody(request, someSchema);
 *       return Response.json(await someService(profile.profileId, input));
 *     } catch (error) {
 *       return handleError(error);
 *     }
 *   }
 */
import type { z } from "zod";

import { NotFoundError, ServiceError, ValidationError } from "@/server/errors";

/** A ServiceError becomes `{ error, code? }` with its status; anything else is logged and becomes a 500. */
export function handleError(error: unknown): Response {
  if (error instanceof ServiceError) {
    const body = error.code ? { error: error.message, code: error.code } : { error: error.message };
    return Response.json(body, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

/** Validates a value with a zod schema: 422 with the first issue's message otherwise. */
export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Invalid request.");
  return result.data;
}

/** The JSON body, validated: 400 when it isn't JSON, 422 when it breaks the schema. */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ServiceError("The request body isn't valid JSON.", 400, "INVALID_JSON");
  }
  return parseWith(schema, body);
}

/** A numeric path id (`/titles/42`): anything else can't match a row, so it's a 404. */
export function parseId(value: string, message = "Not found."): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new NotFoundError(message);
  return id;
}
