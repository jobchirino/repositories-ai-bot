import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { google } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { z } from 'zod';

export async function POST(request) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message || !message.text) {
      return NextResponse.json({ status: 'ok' });
    }

    const chatId = message.chat.id.toString();
    const text = message.text.trim();

    if (text.startsWith('/')) {
      return NextResponse.json({ status: 'ok' });
    }

    const user = await prisma.user.upsert({
      where: { telegramChatId: chatId },
      update: {},
      create: { telegramChatId: chatId, name: message.chat.first_name || 'Usuario' },
    });

    await prisma.message.create({
      data: { role: 'user', content: text, userId: user.id },
    });

    const rawHistory = await prisma.message.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const chatHistory = rawHistory.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    let respuestaGemini = '';

    try {
      const result = await generateText({
        model: google('gemini-2.5-flash'),
        system: `Eres el asistente personal del desarrollador Job Chirino. Tu misión es responder preguntas sobre su experiencia, sus proyectos de GitHub y cualquier código que haya escrito. 

REGLAS ABSOLUTAS:
1. SIEMPRE debes dar una respuesta final en formato de texto al usuario, sin excepción.
2. NUNCA devuelvas solo resultados de herramientas sin procesar. Debes explicar la información al usuario.
3. Si las herramientas fallan o no encuentras información, indica claramente qué intentaste y pide más contexto.
4. Usa las herramientas disponibles para obtener información actualizada de GitHub.
5. Responde de manera útil, concisa y en el mismo idioma que el usuario.`,
        messages: chatHistory,
        tools: {
          listar_repositorios: tool({
            description: 'Lista todos los repositorios públicos de jobchirino en GitHub. Úsala cuando necesites saber qué proyectos existen o cuando no recuerdes el nombre exacto de un repositorio.',
            parameters: z.object({}),
            execute: async () => {
              try {
                const res = await fetch('https://api.github.com/users/jobchirino/repos?sort=updated&per_page=30', {
                  headers: { 'User-Agent': 'Repositories-AI-Bot' },
                });
                if (!res.ok) {
                  return 'Error al consultar la API de GitHub.';
                }
                const repos = await res.json();
                if (!Array.isArray(repos)) {
                  return 'Error al procesar la lista de repositorios.';
                }
                return repos.map((repo) => `${repo.name}: ${repo.description || 'Sin descripción'} (${repo.language || 'N/A'})`).join('\n');
              } catch (error) {
                console.error('Error en listar_repositorios:', error);
                return 'Error de conexión con GitHub.';
              }
            },
          }),
          obtener_readme_github: tool({
            description: 'Obtiene el README completo de un repositorio de jobchirino. Úsala para saber en detalle de qué trata un proyecto, qué tecnologías usa, cómo instalarlo, etc.',
            parameters: z.object({
              repo_name: z.string().describe('El nombre exacto del repositorio en GitHub'),
            }),
            execute: async ({ repo_name }) => {
              try {
                const res = await fetch(`https://api.github.com/repos/jobchirino/${repo_name}/readme`, {
                  headers: { 'User-Agent': 'Repositories-AI-Bot', Accept: 'application/vnd.github.v3.raw' },
                });
                if (!res.ok) {
                  if (res.status === 404) {
                    return `El repositorio "${repo_name}" no fue encontrado o no tiene README.`;
                  }
                  return 'Error al consultar este repositorio.';
                }
                const content = await res.text();
                return content.slice(0, 8000);
              } catch (error) {
                console.error('Error en obtener_readme_github:', error);
                return 'Error de conexión con GitHub.';
              }
            },
          }),
        },
        maxSteps: 5,
      });

      respuestaGemini = result.text.trim();

      if (!respuestaGemini && result.finishReason === 'tool-calls') {
        const toolOutput = result.toolResults
          ?.map((tr) => (typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output)))
          .join('\n\n');

        if (toolOutput) {
          respuestaGemini = `Encontré información relevante:\n\n${toolOutput}`;
        } else {
          respuestaGemini = 'Busqué en mis herramientas pero no pude obtener información útil. ¿Podrías darme más detalles sobre lo que necesitas?';
        }
      }

      if (!respuestaGemini) {
        respuestaGemini = 'Tuve un problema al procesar tu mensaje. Por favor, intenta de nuevo.';
      }
    } catch (error) {
      console.error('Error consultando Gemini:', error);
      respuestaGemini = 'Mi cerebro (Gemini) está ocupado en este momento. Por favor, intenta de nuevo en un momento.';
    }

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: respuestaGemini }),
    });

    await prisma.message.create({
      data: { role: 'model', content: respuestaGemini, userId: user.id },
    });

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error crítico en webhook:', error);
    return NextResponse.json({ status: 'ok' });
  }
}
