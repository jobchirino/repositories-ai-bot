import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message || !message.text) {
      return NextResponse.json({ status: 'ok' });
    }

    const text = message.text.trim();

    if (text.startsWith('/')) {
      return NextResponse.json({ status: 'ok' });
    }

    const workerUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL}/api/worker/telegram`;

    await qstash.publishJSON({
      url: workerUrl,
      body: body,
    });

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error en webhook:', error);
    return NextResponse.json({ status: 'ok' });
  }
}
