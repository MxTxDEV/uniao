import { execSync } from "child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/uniao_test";
  // Segurança: os testes truncam todas as tabelas. Só rodam em banco cujo nome termina em _test.
  const dbName = new URL(url).pathname.replace("/", "");
  if (!dbName.endsWith("_test")) throw new Error(`Banco de testes deve terminar com _test (recebido: ${dbName})`);
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
}
