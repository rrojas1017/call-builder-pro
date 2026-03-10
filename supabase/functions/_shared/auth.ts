import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface AuthResult {
  userId: string;
  orgId: string;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new AuthError("Missing authorization header");
  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new AuthError("Invalid or expired token");
  const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await serviceClient.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile?.org_id) throw new AuthError("User has no organization");
  return { userId: user.id, orgId: profile.org_id };
}

export function requireOrgAccess(auth: AuthResult, targetOrgId: string): void {
  if (auth.orgId !== targetOrgId) {
    throw new AuthError("Access denied: organization mismatch");
  }
}

export function unauthorizedResponse(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
