import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return NextResponse.json({
    env_vars: {
      supabaseUrl: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'MISSING',
      serviceRoleKeyPresent: !!serviceRoleKey,
    },
    timestamp: new Date().toISOString(),
  });
}
