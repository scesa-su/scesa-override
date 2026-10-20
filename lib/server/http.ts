import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, HttpError, cookieOptions, signSessionId, verifySessionCookie } from "./session";

export function json(body: unknown, status = 200, extra?: Record<string, string>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extra },
  });
}

export function sessionIdFrom(req: NextRequest): string | null {
  return verifySessionCookie(req.cookies.get(COOKIE_NAME)?.value);
}

export function setSessionCookie(res: NextResponse, id: string): NextResponse {
  res.cookies.set(COOKIE_NAME, signSessionId(id), cookieOptions());
  return res;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function noSession(): NextResponse {
  return json({ error: "no_session" }, 401);
}

/** Wrap a handler so HttpErrors become JSON responses and anything else a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<NextResponse>) {
  return async (...args: A): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status);
      console.error("[scesa-override] unhandled", err);
      return json({ error: "server_error" }, 500);
    }
  };
}
