import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/**
 * Password hashing with **argon2id** (docs/SECURITY.md §2). Uses the library's
 * vetted defaults (memory/time cost tuned for interactive logins). Verification
 * never throws — a malformed/foreign hash simply returns `false`.
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
