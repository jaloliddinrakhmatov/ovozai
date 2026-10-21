import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { Problems } from "./problem.exception";

/**
 * Validates and parses a value against a zod contract schema. On failure it
 * raises the `validation_failed` problem+json with per-field `errors[]`.
 *
 * Usage: `@Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.map((segment) => String(segment)).join(".") || "(root)",
        message: issue.message,
        code: issue.code,
      }));
      throw Problems.validation(errors);
    }
    return result.data;
  }
}
