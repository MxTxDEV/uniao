import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signToken, verifyToken } from "@/lib/token";
import { authenticate } from "@/server/auth-service";
import {
  changeOwnSuperPassword,
  createSuperAdmin,
  createTenant,
  createTenantUser,
  enterTenant,
  getTenantDetail,
  listActivity,
  listAllUsers,
  listSuperAdmins,
  listTenants,
  tenantCtxFor,
  updateSuperAdmin,
  updateTenant,
  updateTenantUser,
} from "@/server/platform";
import { createUser } from "@/server/users";
import { createSale } from "@/server/sales";
import { getDashboard } from "@/server/stats";
import { makeSuper, makeTenant, resetDb, saleInput } from "./helpers";

beforeEach(resetDb);

const newCompany = { companyName: "Loja Nova", adminName: "Dona Nova", adminEmail: "dona@nova.com", adminPassword: "senhaforte1" };

describe("autorização da plataforma", () => {
  it("nenhuma função da plataforma aceita quem não é super admin (usuário de empresa, id falso, inativo)", async () => {
    const t = await makeTenant();
    const { sa, sc } = await makeSuper();
    const fakes = [{ superAdminId: t.admin.id }, { superAdminId: "inexistente" }, { superAdminId: "" }, undefined as never];
    for (const f of fakes) {
      await expect(listTenants(f)).rejects.toThrow(/super admin/i);
      await expect(createTenant(f, newCompany)).rejects.toThrow(/super admin/i);
      await expect(getTenantDetail(f, t.tenant.id)).rejects.toThrow(/super admin/i);
      await expect(updateTenant(f, t.tenant.id, { name: "x", active: false })).rejects.toThrow(/super admin/i);
      await expect(enterTenant(f, t.tenant.id)).rejects.toThrow(/super admin/i);
      await expect(listAllUsers(f)).rejects.toThrow(/super admin/i);
      await expect(createTenantUser(f, t.tenant.id, { name: "x", email: "x@x.com", password: "12345678", role: "ADMIN" })).rejects.toThrow(/super admin/i);
      await expect(updateTenantUser(f, t.seller1.id, { name: "x", role: "ADMIN", active: true })).rejects.toThrow(/super admin/i);
      await expect(listSuperAdmins(f)).rejects.toThrow(/super admin/i);
      await expect(createSuperAdmin(f, { name: "x", email: "y@y.com", password: "12345678" })).rejects.toThrow(/super admin/i);
      await expect(listActivity(f)).rejects.toThrow(/super admin/i);
    }
    expect(await db.tenant.count()).toBe(1);
    // super admin desativado perde o acesso imediatamente
    await db.superAdmin.update({ where: { id: sa.id }, data: { active: false } });
    await expect(listTenants(sc)).rejects.toThrow(/super admin/i);
  });
});

describe("empresas", () => {
  it("cria empresa + admin que consegue entrar; a empresa existente continua intacta", async () => {
    const t = await makeTenant("União Grifes");
    const { sc } = await makeSuper();
    const { id } = await createTenant(sc, newCompany);
    const admin = await db.user.findUniqueOrThrow({ where: { email: "dona@nova.com" } });
    expect(admin.tenantId).toBe(id);
    expect(admin.role).toBe("ADMIN");
    expect(admin.passwordHash).not.toBe("senhaforte1");
    expect(await authenticate({ email: "DONA@nova.com", password: "senhaforte1" })).toEqual({ kind: "tenant", userId: admin.id, tenantId: id });
    // dados da empresa antiga não mudaram
    expect(await db.user.count({ where: { tenantId: t.tenant.id } })).toBe(3);
    expect(await db.product.count({ where: { tenantId: t.tenant.id } })).toBe(2);
    expect(await db.auditLog.count({ where: { action: "PLATFORM_TENANT_CREATE", tenantId: id } })).toBe(1);
  });

  it("valida entrada e impede e-mail repetido (entre empresas e com super admins)", async () => {
    const t = await makeTenant();
    const { sa, sc } = await makeSuper("Chefe", "chefe@plataforma.com");
    await expect(createTenant(sc, { ...newCompany, companyName: "" })).rejects.toThrow(/Nome da empresa/);
    await expect(createTenant(sc, { ...newCompany, adminEmail: "invalido" })).rejects.toThrow(/E-mail/);
    await expect(createTenant(sc, { ...newCompany, adminPassword: "123" })).rejects.toThrow(/8 caracteres/);
    await expect(createTenant(sc, { ...newCompany, adminEmail: t.admin.email })).rejects.toThrow(/e-mail/i);
    await expect(createTenant(sc, { ...newCompany, adminEmail: sa.email })).rejects.toThrow(/e-mail/i);
    expect(await db.tenant.count()).toBe(1); // nenhuma empresa órfã criada
    // e usuário de empresa não pode usar e-mail de super admin
    await expect(createUser(t.adminCtx, { name: "X", email: "chefe@plataforma.com", password: "12345678", role: "VENDEDOR" })).rejects.toThrow(/e-mail/i);
  });

  it("suspender bloqueia login (senha certa) e dados continuam; reativar libera", async () => {
    const t = await makeTenant();
    const { sc } = await makeSuper();
    await updateTenant(sc, t.tenant.id, { name: t.tenant.name, active: false, phone: "", address: "", instagram: "", internalNotes: "inadimplente" });
    await expect(authenticate({ email: t.admin.email, password: "senha1234" })).rejects.toThrow(/suspensa/);
    // senha errada continua sendo mensagem genérica (não revela status da empresa)
    await expect(authenticate({ email: t.admin.email, password: "errada" })).rejects.toThrow("E-mail ou senha incorretos.");
    expect(await db.sale.count()).toBe(0);
    expect((await getTenantDetail(sc, t.tenant.id)).tenant.internalNotes).toBe("inadimplente");
    await updateTenant(sc, t.tenant.id, { name: t.tenant.name, active: true, phone: "", address: "", instagram: "", internalNotes: "" });
    expect((await authenticate({ email: t.admin.email, password: "senha1234" })).kind).toBe("tenant");
    expect(await db.auditLog.count({ where: { action: "PLATFORM_TENANT_SUSPEND" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "PLATFORM_TENANT_ACTIVATE" } })).toBe(1);
  });

  it("listagem traz usuários e faturamento do mês por empresa, sem misturar", async () => {
    const a = await makeTenant("A");
    const b = await makeTenant("B");
    const { sc } = await makeSuper();
    await createSale(a.adminCtx, saleInput([{ productId: a.camiseta.id, quantity: 2 }])); // 179.80
    await createSale(b.adminCtx, saleInput([{ productId: b.bone.id, quantity: 1 }])); // 79.90
    const { rows, totals } = await listTenants(sc);
    const ra = rows.find((r) => r.id === a.tenant.id)!;
    const rb = rows.find((r) => r.id === b.tenant.id)!;
    expect(ra.monthRevenue).toBe("179.80");
    expect(rb.monthRevenue).toBe("79.90");
    expect(ra.activeUsers).toBe(3);
    expect(totals.monthRevenue).toBe("259.70");
    expect(totals.tenants).toBe(2);
    const detail = await getTenantDetail(sc, a.tenant.id);
    expect(detail.stats.sales30).toBe(1);
    expect(detail.stats.revenue30).toBe("179.80");
    await expect(getTenantDetail(sc, "nao-existe")).rejects.toThrow(/não encontrada/);
  });
});

describe("usuários em todas as empresas", () => {
  it("lista/filtra, cria e edita usuário de qualquer empresa com as mesmas regras", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const { sc } = await makeSuper();
    expect((await listAllUsers(sc)).length).toBe(6);
    expect((await listAllUsers(sc, a.tenant.id)).every((u) => u.tenantId === a.tenant.id)).toBe(true);
    const u = await createTenantUser(sc, b.tenant.id, { name: "Nova", email: "nova@b.com", password: "12345678", role: "VENDEDOR" });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).tenantId).toBe(b.tenant.id);
    await updateTenantUser(sc, u.id, { name: "Nova 2", role: "VENDEDOR", active: true, password: "outrasenha1" });
    expect(await bcrypt.compare("outrasenha1", (await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash)).toBe(true);
    // regra: empresa nunca fica sem admin ativo
    await expect(updateTenantUser(sc, b.admin.id, { name: "Admin", role: "VENDEDOR", active: true })).rejects.toThrow(/administrador ativo/);
    await expect(updateTenantUser(sc, "nao-existe", { name: "x", role: "ADMIN", active: true })).rejects.toThrow(/não encontrado/);
    await expect(createTenantUser(sc, "nao-existe", { name: "x", email: "z@z.com", password: "12345678", role: "ADMIN" })).rejects.toThrow(/não encontrada/);
    // auditoria registra o super admin como autor
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "USER_CREATE", tenantId: b.tenant.id } });
    expect(log.userId).toBe(sc.superAdminId);
  });
});

describe("super admins", () => {
  it("cria, desativa, troca senha; nunca fica sem super admin ativo nem desativa a si mesmo", async () => {
    const { sa, sc } = await makeSuper("Um");
    const two = await createSuperAdmin(sc, { name: "Dois", email: "dois@plataforma.com", password: "12345678" });
    expect((await listSuperAdmins(sc)).length).toBe(2);
    expect((await authenticate({ email: "dois@plataforma.com", password: "12345678" })).kind).toBe("super");
    await expect(updateSuperAdmin(sc, sa.id, { name: "Um", active: false })).rejects.toThrow(/a si mesmo/);
    await updateSuperAdmin(sc, two.id, { name: "Dois", active: false, password: "novasenha99" });
    await expect(authenticate({ email: "dois@plataforma.com", password: "novasenha99" })).rejects.toThrow("E-mail ou senha incorretos.");
    // o outro está inativo: o único ativo não pode ser desativado por si (já bloqueado) — e dois não consegue agir
    await expect(listTenants({ superAdminId: two.id })).rejects.toThrow(/super admin/i);
    await updateSuperAdmin(sc, two.id, { name: "Dois", active: true });
    // desativar o último ativo por outro é impossível pois um único ativo = si mesmo; simula via dois desativando um
    await updateSuperAdmin({ superAdminId: two.id }, sa.id, { name: "Um", active: false });
    await expect(updateSuperAdmin({ superAdminId: two.id }, sa.id, { name: "Um", active: true })).resolves.toBeTruthy();
    await expect(changeOwnSuperPassword(sc, { current: "errada", next: "12345678abc" })).rejects.toThrow(/incorreta/);
    await changeOwnSuperPassword(sc, { current: "senha1234", next: "12345678abc" });
    expect((await authenticate({ email: sa.email, password: "12345678abc" })).kind).toBe("super");
    await expect(createSuperAdmin(sc, { name: "Tres", email: sa.email, password: "12345678" })).rejects.toThrow(/e-mail/i);
  });

  it("login de super admin com senha errada é genérico e conta tentativas", async () => {
    const { sa } = await makeSuper();
    await expect(authenticate({ email: sa.email, password: "errada" })).rejects.toThrow("E-mail ou senha incorretos.");
    expect(await db.auditLog.count({ where: { action: "LOGIN_FAILED", entityId: sa.email } })).toBe(1);
  });
});

describe("super admin dentro da empresa", () => {
  it("opera como admin da empresa (vendas exigem escolher vendedor) e fica auditado; empresa B continua isolada", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const { sc } = await makeSuper();
    await enterTenant(sc, a.tenant.id);
    const ctx = tenantCtxFor(sc, a.tenant.id);
    await expect(createSale(ctx, saleInput([{ productId: a.bone.id, quantity: 1 }]))).rejects.toThrow(/Escolha o vendedor/);
    const sale = await createSale(ctx, saleInput([{ productId: a.bone.id, quantity: 1 }], { sellerId: a.seller1.id }));
    expect(sale.sellerName).toBe("Ana");
    const dash = await getDashboard(ctx, "hoje");
    expect(dash.day.revenue.toFixed(2)).toBe("79.90");
    // o contexto de A não enxerga B
    expect((await getDashboard(tenantCtxFor(sc, b.tenant.id), "hoje")).day.revenue.toFixed(2)).toBe("0.00");
    // produto de B não vende em A
    await expect(createSale(ctx, saleInput([{ productId: b.bone.id, quantity: 1 }], { sellerId: a.seller1.id }))).rejects.toThrow(/Produto/);
    expect(await db.auditLog.count({ where: { action: "SUPER_ENTER_TENANT", tenantId: a.tenant.id } })).toBe(1);
    expect((await db.auditLog.findFirstOrThrow({ where: { action: "SALE_CREATE" } })).userId).toBe(sc.superAdminId);
    const act = await listActivity(sc);
    expect(act.some((x) => x.action === "SALE_CREATE" && x.actorName.includes("super admin"))).toBe(true);
  });
});

describe("token de sessão com super admin", () => {
  it("sa sem tid é válido; usuário de empresa sem tid é inválido; adulteração falha", async () => {
    const t1 = await signToken({ uid: "s1", sa: true });
    expect(await verifyToken(t1)).toEqual({ uid: "s1", sa: true });
    const t2 = await signToken({ uid: "s1", sa: true, tid: "t9" });
    expect(await verifyToken(t2)).toEqual({ uid: "s1", sa: true, tid: "t9" });
    const t3 = await signToken({ uid: "u1" }); // usuário sem empresa
    expect(await verifyToken(t3)).toBeNull();
    const t4 = await signToken({ uid: "u1", tid: "t1" });
    expect(await verifyToken(t4)).toEqual({ uid: "u1", tid: "t1" });
    // tentar promover um token de usuário a super admin trocando o payload invalida a assinatura
    const [h, , s] = t4.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "u1", tid: "t1", sa: true, exp: 9999999999 })).toString("base64url");
    expect(await verifyToken(`${h}.${forged}.${s}`)).toBeNull();
  });
});
