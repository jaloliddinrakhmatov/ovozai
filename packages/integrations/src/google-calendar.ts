/**
 * Minimal, dependency-free Google Calendar integration over the REST API:
 * build the OAuth consent URL, exchange the code for a refresh token, and insert
 * events using a stored refresh token. No `googleapis` SDK — just `fetch`.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Only the scope needed to create events on the user's calendars. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force a refresh token even on re-consent
    include_granted_scopes: "true",
    state: params.state,
  });
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}

export interface GoogleTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export async function exchangeGoogleCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResult> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
}

async function accessTokenFromRefresh(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export interface GoogleCalendarEvent {
  title: string;
  startsAt: string; // ISO 8601
  endsAt?: string; // ISO 8601
  description?: string;
  timezone?: string; // IANA, e.g. Asia/Tashkent
}

export async function createGoogleCalendarEvent(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  event: GoogleCalendarEvent;
  calendarId?: string;
}): Promise<{ externalEventId: string; htmlLink?: string }> {
  const accessToken = await accessTokenFromRefresh(params);
  const tz = params.event.timezone ?? "Asia/Tashkent";
  const start = params.event.startsAt;
  const end = params.event.endsAt ?? new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
  const calendarId = encodeURIComponent(params.calendarId ?? "primary");

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: params.event.title,
      description: params.event.description,
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: end, timeZone: tz },
    }),
  });
  if (!res.ok) {
    throw new Error(`Google event insert failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: string; htmlLink?: string };
  return { externalEventId: json.id, htmlLink: json.htmlLink };
}
