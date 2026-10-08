// Cria uma loja nova com um administrador (para produção, sem dados fictícios).
// Uso: STORE_NAME="União Grifes" ADMIN_NAME="Dono" ADMIN_EMAIL=dono@loja.com ADMIN_PASSWORD='senha-forte-123' npm run admin:create
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const name = process.env.STORE_NAME ?? "União Grifes";
  const adminName = process.env.ADMIN_NAME ?? "Administrador";
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mín. 8 caracteres).");
  if (await db.user.findUnique({ where: { email } })) throw new Error("Já existe usuário com esse e-mail.");
  const tenant = await db.tenant.create({ data: { name } });
  await db.user.create({
    data: { tenantId: tenant.id, name: adminName, email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Loja "${name}" criada. Login: ${email}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); }).finally(() => db.$disconnect());
