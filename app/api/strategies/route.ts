import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/database/mongoose';
import SavedStrategy from '@/database/models/saved-strategy.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    const strategies = await SavedStrategy.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const formattedStrategies = strategies.map(strategy => ({
      _id: strategy._id.toString(),
      id: strategy._id.toString(),
      name: strategy.name,
      type: strategy.isDiscovered ? 'discovered' : 'manual',
      indicators: strategy.indicators || [],
      params: strategy.discoveredParams || {},
      mode: strategy.mode,
      lookForward: strategy.lookForward,
      winRate: strategy.discoveredWinRate || 0,
      totalSignals: strategy.discoveredTotalSignals || 0,
    }));

    return NextResponse.json(formattedStrategies);
  } catch (error) {
    console.error('[API] GET /api/strategies error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
