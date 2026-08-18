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

function validGroupName(value: string) {
  return value.length >= 2 && value.length <= 60 && !/[<>]/.test(value);
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

    if (body.action === "list_groups") {
      const { data: groups, error: groupError } = await admin
        .from("student_groups")
        .select("id,name,created_at")
        .eq("teacher_id", teacher.id)
        .order("name");
      if (groupError) throw groupError;

      const groupIds = (groups || []).map((group) => group.id);
      const { data: memberships, error: memberError } = groupIds.length
        ? await admin
          .from("student_group_members")
          .select("group_id,user_id,profiles(username)")
          .in("group_id", groupIds)
        : { data: [], error: null };
      if (memberError) throw memberError;

      const membersByGroup = new Map<string, Array<{ id: string; username: string }>>();
      for (const membership of memberships || []) {
        const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
        if (!profile) continue;
        const members = membersByGroup.get(membership.group_id) || [];
        members.push({ id: membership.user_id, username: profile.username });
        membersByGroup.set(membership.group_id, members);
      }
      const result = (groups || []).map((group) => ({
        ...group,
        members: (membersByGroup.get(group.id) || []).sort((a, b) => a.username.localeCompare(b.username, "nb")),
      }));
      return Response.json({ groups: result }, { headers });
    }

    if (body.action === "group_results") {
      const groupId = String(body.group_id || "");
      const { data: group } = await admin
        .from("student_groups")
        .select("id,name")
        .eq("id", groupId)
        .eq("teacher_id", teacher.id)
        .maybeSingle();
      if (!group) return Response.json({ error: "Gruppen finnes ikke." }, { status: 404, headers });

      const { data: memberships, error: memberError } = await admin
        .from("student_group_members")
        .select("user_id,profiles(username)")
        .eq("group_id", groupId);
      if (memberError) throw memberError;
      const members = (memberships || []).flatMap((membership) => {
        const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
        return profile ? [{ id: membership.user_id, username: profile.username }] : [];
      }).sort((a, b) => a.username.localeCompare(b.username, "nb"));

      const memberIds = members.map((member) => member.id);
      const { data: results, error: resultError } = memberIds.length
        ? await admin
          .from("results")
          .select("user_id,quiz_id,score,correct_answers,total_questions,best_streak,played_at")
          .in("user_id", memberIds)
          .order("played_at", { ascending: false })
          .limit(5000)
        : { data: [], error: null };
      if (resultError) throw resultError;
      return Response.json({ group, members, results: results || [] }, { headers });
    }

    if (body.action === "create_group") {
      const name = normalize(body.name);
      const sourceGroupId = body.source_group_id ? String(body.source_group_id) : "";
      const pastedUsernames = Array.isArray(body.usernames) ? body.usernames.map(normalize).filter(Boolean) : [];
      const usernames = [...new Map(pastedUsernames.map((username: string) => [key(username), username])).values()] as string[];
      if (!validGroupName(name)) {
        return Response.json({ error: "Gruppenavnet må være mellom 2 og 60 tegn." }, { status: 400, headers });
      }
      if (usernames.length > 40) {
        return Response.json({ error: "Legg inn maksimalt 40 nye elever om gangen." }, { status: 400, headers });
      }
      if (usernames.some((username) => !validUsername(username))) {
        return Response.json({ error: "Alle elevnavn må være 2–24 tegn og kan ikke inneholde spesialtegn." }, { status: 400, headers });
      }

      let sourceMembers: Array<{ user_id: string }> = [];
      if (sourceGroupId) {
        const { data: source } = await admin
          .from("student_groups")
          .select("id")
          .eq("id", sourceGroupId)
          .eq("teacher_id", teacher.id)
          .maybeSingle();
        if (!source) return Response.json({ error: "Gruppen du vil kopiere finnes ikke." }, { status: 404, headers });
        const { data, error } = await admin.from("student_group_members").select("user_id").eq("group_id", sourceGroupId);
        if (error) throw error;
        sourceMembers = data || [];
      }

      const { data: group, error: createError } = await admin
        .from("student_groups")
        .insert({ teacher_id: teacher.id, name })
        .select("id,name,created_at")
        .single();
      if (createError?.code === "23505") {
        return Response.json({ error: `Gruppen «${name}» finnes allerede.` }, { status: 409, headers });
      }
      if (createError) throw createError;

      const accounts: Array<{ id: string; username: string; pin: string }> = [];
      const memberIds = new Set(sourceMembers.map((member) => member.user_id));
      const cleanup = async () => {
        await Promise.all(accounts.map((account) => admin.auth.admin.deleteUser(account.id)));
        await admin.from("student_groups").delete().eq("id", group.id).eq("teacher_id", teacher.id);
      };

      if (usernames.length) {
        const { data: profiles, error: profilesError } = await admin.from("profiles").select("id,username");
        if (profilesError) {
          await cleanup();
          throw profilesError;
        }
        const profileByName = new Map((profiles || []).map((profile) => [key(profile.username), profile]));

        for (const username of usernames) {
          const existing = profileByName.get(key(username));
          if (existing) {
            memberIds.add(existing.id);
            continue;
          }

          const pin = makePin();
          const { data, error } = await admin.auth.admin.createUser({
            email: await internalEmail(username),
            password: pin,
            email_confirm: true,
          });
          if (error || !data.user) {
            await cleanup();
            return Response.json({ error: `Kunne ikke opprette «${username}». Brukernavnet kan være opptatt.` }, { status: 409, headers });
          }
          const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, username });
          if (profileError) {
            await admin.auth.admin.deleteUser(data.user.id);
            await cleanup();
            return Response.json({ error: `Kunne ikke opprette «${username}». Brukernavnet kan være opptatt.` }, { status: 409, headers });
          }
          accounts.push({ id: data.user.id, username, pin });
          memberIds.add(data.user.id);
        }
      }

      if (memberIds.size) {
        const { error } = await admin.from("student_group_members").insert(
          [...memberIds].map((userId) => ({ group_id: group.id, user_id: userId })),
        );
        if (error) {
          await cleanup();
          throw error;
        }
      }
      return Response.json({ group: { ...group, member_count: memberIds.size }, accounts }, { status: 201, headers });
    }

    if (body.action === "set_group_members") {
      const groupId = String(body.group_id || "");
      const memberIds = Array.isArray(body.member_ids) ? [...new Set(body.member_ids.map(String))] : [];
      if (memberIds.length > 300) {
        return Response.json({ error: "En gruppe kan ha maksimalt 300 elever." }, { status: 400, headers });
      }
      const { data: group } = await admin
        .from("student_groups")
        .select("id")
        .eq("id", groupId)
        .eq("teacher_id", teacher.id)
        .maybeSingle();
      if (!group) return Response.json({ error: "Gruppen finnes ikke." }, { status: 404, headers });

      if (memberIds.length) {
        const { data: profiles, error: profileError } = await admin.from("profiles").select("id").in("id", memberIds);
        if (profileError) throw profileError;
        if ((profiles || []).length !== memberIds.length) {
          return Response.json({ error: "Elevlisten inneholder en konto som ikke finnes." }, { status: 400, headers });
        }
      }

      const { data: current, error: currentError } = await admin
        .from("student_group_members")
        .select("user_id")
        .eq("group_id", groupId);
      if (currentError) throw currentError;
      const currentIds = new Set((current || []).map((member) => member.user_id));
      const wantedIds = new Set(memberIds);
      const toAdd = memberIds.filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !wantedIds.has(id));

      if (toAdd.length) {
        const { error } = await admin.from("student_group_members").insert(
          toAdd.map((userId) => ({ group_id: groupId, user_id: userId })),
        );
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await admin
          .from("student_group_members")
          .delete()
          .eq("group_id", groupId)
          .in("user_id", toRemove);
        if (error) throw error;
      }
      return Response.json({ group_id: groupId, member_count: memberIds.length }, { headers });
    }

    if (body.action === "delete_group") {
      const groupId = String(body.group_id || "");
      const { data: group } = await admin
        .from("student_groups")
        .select("id,name")
        .eq("id", groupId)
        .eq("teacher_id", teacher.id)
        .maybeSingle();
      if (!group) return Response.json({ error: "Gruppen finnes ikke." }, { status: 404, headers });
      const { error } = await admin
        .from("student_groups")
        .delete()
        .eq("id", groupId)
        .eq("teacher_id", teacher.id);
      if (error) throw error;
      return Response.json({ id: group.id, name: group.name }, { headers });
    }

    if (body.action === "student_results") {
      const id = String(body.id || "");
      const { data: profile } = await admin.from("profiles").select("id,username").eq("id", id).maybeSingle();
      if (!profile) return Response.json({ error: "Elevkontoen finnes ikke." }, { status: 404, headers });
      const { data: results, error } = await admin
        .from("results")
        .select("quiz_id,score,correct_answers,total_questions,best_streak,played_at")
        .eq("user_id", id)
        .order("played_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return Response.json({ student: profile, results }, { headers });
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

    if (body.action === "delete_student") {
      const id = String(body.id || "");
      const { data: profile } = await admin.from("profiles").select("id,username").eq("id", id).maybeSingle();
      if (!profile) return Response.json({ error: "Elevkontoen finnes ikke." }, { status: 404, headers });

      const { data: results, error: resultLookupError } = await admin.from("results").select("id").eq("user_id", id);
      if (resultLookupError) throw resultLookupError;

      const { error: deleteUserError } = await admin.auth.admin.deleteUser(id);
      if (deleteUserError) throw deleteUserError;

      const resultIds = (results || []).map((result) => result.id);
      if (resultIds.length) {
        const { error: deleteResultsError } = await admin.from("results").delete().in("id", resultIds);
        if (deleteResultsError) {
          return Response.json({ error: "Elevkontoen ble slettet, men noen gamle resultater kunne ikke fjernes." }, { status: 500, headers });
        }
      }
      return Response.json({ id, username: profile.username, deleted_results: resultIds.length }, { headers });
    }

    return Response.json({ error: "Ukjent handling." }, { status: 400, headers });
  } catch {
    return Response.json({ error: "Handlingen kunne ikke gjennomføres." }, { status: 500, headers });
  }
});
