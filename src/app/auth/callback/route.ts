import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    // Build the redirect response first so we can set cookies ON it
    const response = NextResponse.redirect(`${origin}/swipe`);

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          // ✅ Cookies are set on the RESPONSE — this is what persists the session
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if this user already has a public profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!profile) {
        // First login — redirect to onboarding, carrying session cookies over
        const onboardingRes = NextResponse.redirect(`${origin}/onboarding`);
        response.cookies.getAll().forEach(({ name, value }) => {
          onboardingRes.cookies.set(name, value);
        });
        return onboardingRes;
      }

      return response; // Session cookies are attached to this response ✅
    }
  }

  return NextResponse.redirect(`${origin}/profile?error=auth_failed`);
}
