import { NextResponse } from 'next/server';
import { AsyncJobService } from '@/services/job.service';

export async function POST() {
  try {
    const result = await AsyncJobService.processNextJob();
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
