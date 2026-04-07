import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const results = {
    env_vars_present: {
      supabaseUrl: !!supabaseUrl,
      serviceRoleKey: !!serviceRoleKey,
    },
    supabase_url_value: supabaseUrl || 'MISSING',
    connectivity_test: null as any,
  };

  // Try to actually connect to Supabase
  if (supabaseUrl && serviceRoleKey) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      });
      results.connectivity_test = {
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: any) {
      results.connectivity_test = {
        error: error.message,
        code: error.code,
      };
    }
  }

  return NextResponse.json(results);
}
