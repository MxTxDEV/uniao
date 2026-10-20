// Roda a cada subida do container. Se NÃO existir nenhum super admin, cria o padrão (credenciais em src/lib/default-super.ts).
// Depois que o dono criar o próprio super admin e apagar o padrão, ele NÃO volta (já existe outro super admin).
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_SUPER_EMAIL, DEFAULT_SUPER_NAME, DEFAULT_SUPER_PASSWORD } from "../src/lib/default-super";

const db = new PrismaClient();

async function main() {
  if ((await db.superAdmin.count()) > 0) {
    console.log("[super admin] já existe ao menos um super admin; nada a fazer.");
    return;
  }
  if (await db.user.findUnique({ where: { email: DEFAULT_SUPER_EMAIL } })) {
    console.log(`[super admin] ${DEFAULT_SUPER_EMAIL} pertence a um usuário de empresa; padrão não criado.`);
    return;
  }
  try {
    await db.superAdmin.create({
      data: { name: DEFAULT_SUPER_NAME, email: DEFAULT_SUPER_EMAIL, passwordHash: await bcrypt.hash(DEFAULT_SUPER_PASSWORD, 12) },
    });
    console.log(`[super admin] padrão criado: ${DEFAULT_SUPER_EMAIL} / ${DEFAULT_SUPER_PASSWORD}  (troque criando o seu em /super/admins)`);
  } catch (e) {
    // outra instância criou ao mesmo tempo
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}

main()
  .catch((e) => {
    console.error("[super admin] falha ao criar o padrão:", e.message ?? e);
  })
  .finally(() => db.$disconnect());
