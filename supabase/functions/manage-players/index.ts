import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://utneapps.no", "https://www.utneapps.no", "http://127.0.0.1:8765", "http://localhost:8765"]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://utneapps.no",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
    "Vary": "Origin",
  };
}

function normalize(value: unknown) {
  return String(value || "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function key(value: string) {
  return value.toLocaleLowerCase("nb-NO");
}

function validUsername(value: string) {
  return value.length >= 2
    && value.length <= 24
    && /^[\p{L}\p{N}][\p{L}\p{N} ._-]*[\p{L}\p{N}]$/u.test(value);
}

async function internalEmail(username: string) {
  const bytes = new TextEncoder().encode(key(username));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `u-${hash.slice(0, 40)}@utneapps.no`;
}

function makePin() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(100000 + (value[0] % 900000));
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return Response.json({ error: "Ugyldig forespørsel." }, { status: 405, headers });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Du må være logget inn som lærer." }, { status: 401, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "Lærerøkten er utløpt." }, { status: 401, headers });

  const { data: teacher } = await admin.from("teacher_users").select("id").eq("id", userData.user.id).maybeSingle();
  if (!teacher) return Response.json({ error: "Denne kontoen har ikke lærertilgang." }, { status: 403, headers });

  try {
    const body = await request.json();
    if (body.action === "list") {
      const { data, error } = await admin.from("profiles").select("id,username,created_at").order("username");
      if (error) throw error;
      return Response.json({ students: data }, { headers });
    }

    if (body.action === "create") {
      const usernames = Array.isArray(body.usernames) ? body.usernames.map(normalize).filter(Boolean) : [];
      if (!usernames.length || usernames.length > 40) {
        return Response.json({ error: "Legg inn mellom 1 og 40 elever om gangen." }, { status: 400, headers });
      }
      if (usernames.some((username: string) => !validUsername(username))) {
        return Response.json({ error: "Alle brukernavn må være 2–24 tegn og kan ikke inneholde spesialtegn." }, { status: 400, headers });
      }
      if (new Set(usernames.map(key)).size !== usernames.length) {
        return Response.json({ error: "Elevlisten inneholder samme brukernavn flere ganger." }, { status: 400, headers });
      }

      const { data: existingProfiles, error: existingError } = await admin.from("profiles").select("username");
      if (existingError) throw existingError;
      const existingNames = new Set((existingProfiles || []).map((profile) => key(profile.username)));
      const conflict = usernames.find((username: string) => existingNames.has(key(username)));
      if (conflict) {
        return Response.json({ error: `Brukernavnet «${conflict}» er allerede i bruk.` }, { status: 409, headers });
      }

      const accounts: Array<{ id: string; username: string; pin: string }> = [];
      for (const username of usernames) {
        const pin = makePin();
        const { data, error } = await admin.auth.admin.createUser({
          email: await internalEmail(username),
          password: pin,
          email_confirm: true,
        });
        if (error || !data.user) {
          await Promise.all(accounts.map((account) => admin.auth.admin.deleteUser(account.id)));
          return Response.json({ error: `Kunne ikke opprette «${username}». Brukernavnet kan være opptatt.` }, { status: 409, headers });
        }
        const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, username });
        if (profileError) {
          await admin.auth.admin.deleteUser(data.user.id);
          await Promise.all(accounts.map((account) => admin.auth.admin.deleteUser(account.id)));
          return Response.json({ error: `Kunne ikke opprette «${username}». Brukernavnet kan være opptatt.` }, { status: 409, headers });
        }
        accounts.push({ id: data.user.id, username, pin });
      }
      return Response.json({ accounts }, { status: 201, headers });
    }

    if (body.action === "reset_pin") {
      const id = String(body.id || "");
      const { data: profile } = await admin.from("profiles").select("id,username").eq("id", id).maybeSingle();
      if (!profile) return Response.json({ error: "Elevkontoen finnes ikke." }, { status: 404, headers });
      const pin = makePin();
      const { error } = await admin.auth.admin.updateUserById(id, { password: pin });
      if (error) throw error;
      return Response.json({ id, username: profile.username, pin }, { headers });
    }

    return Response.json({ error: "Ukjent handling." }, { status: 400, headers });
  } catch {
    return Response.json({ error: "Handlingen kunne ikke gjennomføres." }, { status: 500, headers });
  }
});
