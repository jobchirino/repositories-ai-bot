import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { google } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { z } from 'zod';

export async function POST(request) {
  try {
    const body = await request.json();
    const message = body.message;
    if (!message || !message.text) return NextResponse.json({ status: 'ok' });

    const chatId = message.chat.id.toString();
    const text = message.text;

    // 1. Guardar o buscar al usuario
    const user = await prisma.user.upsert({
      where: { telegramChatId: chatId },
      update: {},
      create: { telegramChatId: chatId, name: message.chat.first_name },
    });

    // 2. Guardar el mensaje del usuario
    await prisma.message.create({
      data: { role: 'user', content: text, userId: user.id },
    });

    // 3. RECUPERAR LA MEMORIA (Últimos 10 mensajes)
    const rawHistory = await prisma.message.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    
    // Invertimos el array para que queden en orden cronológico para Gemini
    const chatHistory = rawHistory.reverse().map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    let respuestaGemini = ""
    // 4. LLAMAR A GEMINI CON FUNCTION CALLING
    try {
      const { text } = await generateText({
          model: google('gemini-2.5-flash'), // O gemini-1.5-flash si prefieres más velocidad
          system: "Eres el asistente personal del desarrollador Job. Tu misión es responder preguntas sobre su experiencia y sus proyectos de GitHub. ERES ESTRICTO CON ESTO: SIEMPRE debes dar una respuesta final en formato de texto al usuario, incluso si no encuentras la información, si las herramientas fallan, o si no estás seguro.",
          messages: chatHistory,
          tools: {
              listar_repositorios: tool({
                  description: 'Obtiene una lista con los nombres exactos de todos los repositorios públicos de Job. Úsala PRIMERO cuando el usuario pregunte por un proyecto y no sepas el nombre exacto del repositorio.',
                  parameters: z.object({}),
                  execute: async () => {
                    try {
                      const res = await fetch(`https://api.github.com/users/jobchirino/repos`, {
                        headers: { 'User-Agent': 'Repositories-AI-Bot' }
                      });
                      if (!res.ok) {
                        return "Error al consultar la API de GitHub para listar repositorios.";
                      }
                      const repos = await res.json();
                      if (!Array.isArray(repos)) {
                        return "Error al consultar la API de GitHub para listar repositorios.";
                      }
                      return repos.map(repo => repo.name).join(', ');
                    } catch (error) {
                      console.error("Error en listar_repositorios:", error);
                      return "Error al consultar la API de GitHub para listar repositorios.";
                    }
                  },
              }),
              obtener_readme_github: tool({
                  description: 'Obtiene el archivo README de un repositorio público de GitHub de Job para saber de qué trata el proyecto y qué tecnologías usa.',
                  parameters: z.object({
                    repo_name: z.string().describe('El nombre exacto del repositorio'),
                  }),
                  execute: async ({ repo_name }) => {
                    try {
                      console.log(`Gemini decidió buscar el repo: ${repo_name}`);
                      const res = await fetch(`https://api.github.com/repos/jobchirino/${repo_name}/readme`, {
                        headers: { 'User-Agent': 'Repositories-AI-Bot' }
                      });
                      if (!res.ok) {
                        if (res.status === 404) {
                          return "Repositorio no encontrado o no tiene README.";
                        }
                        return "Error al consultar la API de GitHub para este repositorio.";
                      }
                      const data = await res.json();
                      return Buffer.from(data.content, 'base64').toString('utf-8');
                    } catch (error) {
                      console.error("Error en obtener_readme_github:", error);
                      return "Error al consultar la API de GitHub para este repositorio.";
                    }
                  },
              }),
        },
        maxSteps: 5, // CRUCIAL: Permite que Gemini pida la herramienta, tu código la ejecute, y Gemini lea el resultado para responder.
      });
      respuestaGemini = text.trim();
      if (!respuestaGemini) {
        respuestaGemini = "Busqué en mis registros, pero la información sobre ese proyecto en específico es un poco confusa. ¿Podrías mencionarme alguna tecnología que usé ahí o darme otro detalle?";
      }
    } catch (error) {
      console.error("Error consultando a Gemini:", error);
      respuestaGemini = "Lo siento, mi procesador (Gemini) está un poco saturado en este momento. Por favor, intenta de nuevo en un minuto.";
    }

    // 5. ENVIAR LA RESPUESTA A TELEGRAM
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: respuestaGemini }),
    });

    // 6. GUARDAR LA RESPUESTA DE GEMINI EN LA BD
    await prisma.message.create({
      data: { role: 'model', content: respuestaGemini, userId: user.id },
    });

    return NextResponse.json({ status: 'ok' });

  } catch (error) {
    console.error("Error crítico en el webhook:", error);
    return NextResponse.json({ status: 'ok' });
  }
}

//https://repositories-ai-bot.vercel.app/api/webhook/telegram
//https://api.telegram.org/bot8571902665:AAH6M8NsONYW3ko9DGRl74CpYelIIpvbu2o/setWebhook?url=https://repositories-ai-bot.vercel.app/api/webhook/telegram