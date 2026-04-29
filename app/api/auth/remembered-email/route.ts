import { NextRequest, NextResponse } from 'next/server';
import { EMAIL_COOKIE } from '@/lib/supabase/constants';

/**
 * GET /api/auth/remembered-email
 * 
 * Returns the remembered email from the server-side cookie.
 * More reliable than client-side document.cookie for PWA contexts.
 * Called on login page mount to prefill the email field.
 */
export async function GET(request: NextRequest) {
  try {
    const email = request.cookies.get(EMAIL_COOKIE)?.value;
    
    if (!email) {
      return NextResponse.json({ email: null });
    }
    
    console.info('[TourBook Auth] GET /api/auth/remembered-email — found email ✓');
    return NextResponse.json({ email });
  } catch (err) {
    console.error('[TourBook Auth] GET /api/auth/remembered-email — error', err);
    return NextResponse.json({ email: null }, { status: 500 });
  }
}
