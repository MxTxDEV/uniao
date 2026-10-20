// Cria (ou, com SUPERADMIN_RESET_PASSWORD=true, redefine a senha de) um super admin.
// Uso: SUPERADMIN_EMAIL=voce@email.com SUPERADMIN_PASSWORD='senha-forte' [SUPERADMIN_NAME="Seu Nome"] npm run superadmin:create
// É idempotente: se o e-mail já é de um super admin, não faz nada (a menos que RESET_PASSWORD=true).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? "";
  const name = (process.env.SUPERADMIN_NAME ?? "Super Admin").trim() || "Super Admin";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Defina SUPERADMIN_EMAIL com um e-mail válido.");
  if (password.length < 8) throw new Error("SUPERADMIN_PASSWORD deve ter ao menos 8 caracteres.");

  if (await db.user.findUnique({ where: { email } })) throw new Error(`O e-mail ${email} já pertence a um usuário de empresa. Use outro e-mail.`);

  const existing = await db.superAdmin.findUnique({ where: { email } });
  if (existing) {
    if (process.env.SUPERADMIN_RESET_PASSWORD === "true") {
      await db.superAdmin.update({ where: { id: existing.id }, data: { passwordHash: await bcrypt.hash(password, 12), active: true } });
      console.log(`Super admin ${email}: senha redefinida.`);
    } else {
      console.log(`Super admin ${email} já existe (nada alterado).`);
    }
    return;
  }
  await db.superAdmin.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12) } });
  console.log(`Super admin criado: ${email}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
