import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; 

export async function POST(request) {
  try {
    const body = await request.json();

    const message = body.message;
    if (!message || !message.text) {
        return NextResponse.json({ status: 'ok' }); 
    }

    const chatId = message.chat.id.toString();
    const text = message.text;
    const firstName = message.chat.first_name || 'Usuario';

    const user = await prisma.user.upsert({
      where: { telegramChatId: chatId },
      update: {}, // No actualizamos nada si ya existe
      create: {
        telegramChatId: chatId,
        name: firstName,
      },
    });

    await prisma.message.create({
      data: {
        role: 'user',
        content: text,
        userId: user.id,
      },
    });

    console.log(`✅ Mensaje guardado en BD de ${firstName}: ${text}`);

    return NextResponse.json({ status: 'ok' });

  } catch (error) {
    console.error("Error procesando el webhook:", error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}

//https://repositories-ai-bot.vercel.app/api/webhook/telegram
//https://api.telegram.org/bot8571902665:AAH6M8NsONYW3ko9DGRl74CpYelIIpvbu2o/setWebhook?url=https://repositories-ai-bot.vercel.app/api/webhook/telegram