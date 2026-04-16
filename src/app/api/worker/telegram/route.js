import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { google } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { mcpTools, getReadmeTool, listRepositoriesTool } from '@/mcp';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

async function handler(request) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message || !message.text) {
      return NextResponse.json({ success: false, error: 'No message' });
    }

    const chatId = message.chat.id.toString();
    const text = message.text.trim();

    if (text.startsWith('/')) {
      return NextResponse.json({ success: true });
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
5. Responde de manera útil, concisa y en el mismo idioma que el usuario.
6. IMPORTANTE: Cuando el usuario mencione un proyecto específico, usa OBLIGATORIAMENTE la herramienta get_readme con el parámetro repo_name contendo el nombre exacto del repositorio.
7. Ejemplo: Si el usuario dice "háblame de cesarAugustoApp", debes invocar: get_readme({ repo_name: "cesarAugustoApp" })`,
        messages: chatHistory,
        tools: {
          list_repositories: tool({
            description: listRepositoriesTool.description,
            parameters: listRepositoriesTool.inputSchema,
            execute: async () => {
              const result = await mcpTools[0].execute();
              return result.content[0].text;
            },
          }),
          get_readme: tool({
            description: getReadmeTool.description,
            parameters: getReadmeTool.inputSchema,
            execute: async ({ repo_name }) => {
              if (!repo_name) {
                return 'Error: No se proporcionó el nombre del repositorio.';
              }
              const result = await mcpTools[1].execute(repo_name);
              return result.content[0].text;
            },
          }),
        },
        maxSteps: 5,
      });

      respuestaGemini = result.text.trim();

      if (!respuestaGemini && result.finishReason === 'tool-calls') {
        const toolOutput = result.toolResults
          ?.map((tr) => {
            const output = typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output);
            if (output.includes('undefined') || output.includes('No se proporcionó')) {
              return 'La herramienta no pudo obtener el nombre del repositorio. Por favor intenta mencionar el nombre del proyecto de forma más clara (ej: "cesarAugustoApp", "trainy-app").';
            }
            return output;
          })
          .join('\n\n');

        if (toolOutput && !toolOutput.includes('no pudo obtener')) {
          respuestaGemini = `Encontré información relevante:\n\n${toolOutput}`;
        } else {
          respuestaGemini = toolOutput;
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en worker:', error);
    return NextResponse.json({ success: false, error: 'Internal error' });
  }
}

const wrappedHandler = verifySignatureAppRouter(handler);
export { wrappedHandler as POST };
