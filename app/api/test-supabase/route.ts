import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const result: any = {
    env_present: {
      url: !!supabaseUrl,
      key: !!serviceRoleKey,
    },
    url_sample: supabaseUrl ? supabaseUrl.substring(0, 30) : 'MISSING',
  };

  // Try to actually reach Supabase
  if (supabaseUrl && serviceRoleKey) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      result.connectivity = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (err: any) {
      result.connectivity = {
        error: err.message || String(err),
        type: err.name,
      };
    }
  }

  return NextResponse.json(result);
}
