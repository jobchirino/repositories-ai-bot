import prisma from "@/lib/prisma";

export default async function Home() {
  const users = await prisma.user.findMany()
  return (
    <div>
      <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200">
        Welcome to repositories aibot
      </h1>
      <p>Hay {users.length} usuarios registrados</p>
    </div>
  );
}
