import { NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await inngest.send({
      name: 'paper-trading/daily-execution',
      data: {}
    });

    return NextResponse.json({ success: true, message: 'Execution triggered' });
  } catch (error) {
    console.error('[API] /api/paper-trading/execute error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
