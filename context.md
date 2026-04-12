# Contexto del Proyecto: Repositories AI Bot (Telegram)

## Objetivo
Un bot de Telegram que actúa como asistente personal para responder preguntas sobre los proyectos de GitHub del desarrollador, utilizando llamadas a herramientas (Function Calling) y contexto conversacional.

## Tech Stack
- **Framework:** Next.js (App Router).
- **Base de Datos:** Neon (Serverless Postgres).
- **ORM:** Prisma (`@prisma/client`).
- **IA / Orquestación:** Vercel AI SDK (`ai`, `@ai-sdk/google`).
- **Modelo de IA:** Gemini (`gemini-2.5-flash`).
- **Despliegue:** Vercel (Edge/Serverless functions).

## Estructura de la Base de Datos (Prisma)
- `User`: Almacena `telegramChatId` y `name`.
- `Message`: Almacena el historial de chat (`role`: 'user' o 'model', `content`, `userId`).

## Flujo del Webhook (src/app/api/webhook/telegram/route.js)
1. Telegram envía un POST request (Webhook) con el mensaje del usuario.
2. Buscamos/creamos al usuario en la BD (`prisma.user.upsert`).
3. Guardamos el mensaje del usuario en la BD.
4. Recuperamos los últimos 10 mensajes del usuario para armar el `chatHistory`.
5. Llamamos a Gemini usando `generateText` del Vercel AI SDK, inyectando el historial y las herramientas de GitHub (`listar_repositorios`, `obtener_readme_github`).
6. Enviamos la respuesta resultante a la API REST de Telegram (`/sendMessage`).
7. Guardamos la respuesta del modelo en la BD.
8. **REGLA CRÍTICA:** Siempre se debe devolver un `NextResponse.json({ status: 'ok' })` con código 200, incluso si hay errores, para evitar que Telegram haga reintentos infinitos.

## Consideraciones Arquitectónicas
- El entorno es Serverless (Vercel), por lo que las funciones deben resolverse rápidamente.
- La IA tiende a agotar los pasos de herramientas (`maxSteps`) si no encuentra lo que busca, lo que puede generar strings vacíos.