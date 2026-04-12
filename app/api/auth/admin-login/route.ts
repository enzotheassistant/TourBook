import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'Admin unlock has been replaced by account-based access.' },
    { status: 410 },
  );
}
