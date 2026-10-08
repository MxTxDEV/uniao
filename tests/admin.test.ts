import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authenticate } from "@/server/auth-service";
import { createProduct, listActiveProducts, listProducts, setProductActive, updateProduct } from "@/server/products";
import { changeOwnPassword, createUser, listUsers, updateUser } from "@/server/users";
import { getTenant, updateSettings } from "@/server/settings";
import { makeTenant, resetDb } from "./helpers";

beforeEach(resetDb);

const prod = { name: "Tênis Nike", category: "Tênis", price: "299.90", sku: "", imageUrl: "", active: true };

describe("produtos", () => {
  it("admin cria/edita; vendedor não; dados sanitizados", async () => {
    const t = await makeTenant();
    const p = await createProduct(t.adminCtx, { ...prod, name: "  Tênis\u0007 Nike  " });
    expect(p.name).toBe("Tênis Nike");
    expect(p.sku).toBeNull();
    expect(p.price).toBe("299.90");
    await expect(createProduct(t.s1Ctx, prod)).rejects.toThrow(/permissão/);
    await expect(updateProduct(t.s1Ctx, p.id, prod)).rejects.toThrow(/permissão/);
    await expect(listProducts(t.s1Ctx)).rejects.toThrow(/permissão/);
    const up = await updateProduct(t.adminCtx, p.id, { ...prod, price: "310.00" });
    expect(up.price).toBe("310.00");
  });

  it("valida campos", async () => {
    const t = await makeTenant();
    await expect(createProduct(t.adminCtx, { ...prod, name: "" })).rejects.toThrow(/Nome/);
    await expect(createProduct(t.adminCtx, { ...prod, price: "0" })).rejects.toThrow(/maior que zero/);
    await expect(createProduct(t.adminCtx, { ...prod, price: "abc" })).rejects.toThrow(/inválido/);
    await expect(createProduct(t.adminCtx, { ...prod, imageUrl: "javascript:alert(1)" })).rejects.toThrow(/http/);
    await expect(createProduct(t.adminCtx, { ...prod, category: "" })).rejects.toThrow(/Categoria/);
  });

  it("não é possível ler/alterar/desativar produto de outra loja pelo ID", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await expect(updateProduct(b.adminCtx, a.bone.id, prod)).rejects.toThrow(/não encontrado/);
    await expect(setProductActive(b.adminCtx, a.bone.id, false)).rejects.toThrow(/não encontrado/);
    expect((await db.product.findUniqueOrThrow({ where: { id: a.bone.id } })).active).toBe(true);
    expect((await listProducts(b.adminCtx)).map((p) => p.id)).not.toContain(a.bone.id);
    expect((await listActiveProducts(b.s1Ctx)).map((p) => p.id)).not.toContain(a.bone.id);
  });

  it("inativos saem do PDV mas continuam na listagem admin", async () => {
    const t = await makeTenant();
    await setProductActive(t.adminCtx, t.bone.id, false);
    expect((await listActiveProducts(t.s1Ctx)).map((p) => p.id)).toEqual([t.camiseta.id]);
    expect(await listProducts(t.adminCtx)).toHaveLength(2);
    expect(await listProducts(t.adminCtx, "bon")).toHaveLength(1);
  });
});

describe("funcionários", () => {
  it("cria, senha com hash, e-mail único, validações", async () => {
    const t = await makeTenant();
    const u = await createUser(t.adminCtx, { name: "Carla", email: " CARLA@Loja.com ", password: "12345678", role: "VENDEDOR" });
    expect(u.email).toBe("carla@loja.com");
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.passwordHash).not.toBe("12345678");
    expect(await bcrypt.compare("12345678", row.passwordHash)).toBe(true);
    expect(row.tenantId).toBe(t.tenant.id);
    await expect(createUser(t.adminCtx, { name: "X", email: "carla@loja.com", password: "12345678", role: "VENDEDOR" })).rejects.toThrow(/e-mail/i);
    await expect(createUser(t.adminCtx, { name: "X", email: "x@x.com", password: "123", role: "VENDEDOR" })).rejects.toThrow(/8 caracteres/);
    await expect(createUser(t.adminCtx, { name: "X", email: "x@x.com", password: "12345678", role: "ROOT" })).rejects.toThrow(/Perfil/);
    await expect(createUser(t.s1Ctx, { name: "X", email: "y@x.com", password: "12345678", role: "ADMIN" })).rejects.toThrow(/permissão/);
    await expect(listUsers(t.s1Ctx)).rejects.toThrow(/permissão/);
  });

  it("não edita usuário de outra loja; não rebaixa a si mesmo nem o último admin", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await expect(updateUser(b.adminCtx, a.seller1.id, { name: "Hack", role: "ADMIN", active: true })).rejects.toThrow(/não encontrado/);
    await expect(updateUser(a.adminCtx, a.admin.id, { name: "Admin", role: "VENDEDOR", active: true })).rejects.toThrow(/a si mesmo/);
    await expect(updateUser(a.adminCtx, a.admin.id, { name: "Admin", role: "ADMIN", active: false })).rejects.toThrow(/a si mesmo/);
    // promove Ana a admin, depois ela tenta desativar o único outro admin... (admin original) — ok pois ela continua
    await updateUser(a.adminCtx, a.seller1.id, { name: "Ana", role: "ADMIN", active: true });
    const anaCtx = { ...a.s1Ctx, role: "ADMIN" as const };
    await updateUser(anaCtx, a.admin.id, { name: "Admin", role: "VENDEDOR", active: true });
    // agora Ana é o único admin: ninguém pode removê-la (nem ela, pela regra do próprio usuário)
    await expect(updateUser(anaCtx, a.seller1.id, { name: "Ana", role: "VENDEDOR", active: true })).rejects.toThrow();
  });

  it("troca de senha de funcionário e da própria conta", async () => {
    const t = await makeTenant();
    await updateUser(t.adminCtx, t.seller1.id, { name: "Ana", role: "VENDEDOR", active: true, password: "novasenha1" });
    expect(await bcrypt.compare("novasenha1", (await db.user.findUniqueOrThrow({ where: { id: t.seller1.id } })).passwordHash)).toBe(true);
    await expect(changeOwnPassword(t.s1Ctx, { current: "errada", next: "outrasenha1" })).rejects.toThrow(/incorreta/);
    await changeOwnPassword(t.s1Ctx, { current: "novasenha1", next: "outrasenha1" });
    expect(await bcrypt.compare("outrasenha1", (await db.user.findUniqueOrThrow({ where: { id: t.seller1.id } })).passwordHash)).toBe(true);
  });
});

describe("login", () => {
  it("autentica, registra log, bloqueia inativos e erra com mensagem genérica", async () => {
    const t = await makeTenant();
    const email = t.admin.email;
    const ok = await authenticate({ email: email.toUpperCase(), password: "senha1234" });
    expect(ok).toEqual({ userId: t.admin.id, tenantId: t.tenant.id });
    await expect(authenticate({ email, password: "errada" })).rejects.toThrow("E-mail ou senha incorretos.");
    await expect(authenticate({ email: "naoexiste@x.com", password: "errada" })).rejects.toThrow("E-mail ou senha incorretos.");
    await db.user.update({ where: { id: t.seller1.id }, data: { active: false } });
    await expect(authenticate({ email: t.seller1.email, password: "senha1234" })).rejects.toThrow("E-mail ou senha incorretos.");
  });

  it("limita tentativas por e-mail (força bruta)", async () => {
    const t = await makeTenant();
    for (let i = 0; i < 8; i++) await expect(authenticate({ email: t.admin.email, password: "x" + i })).rejects.toThrow(/incorretos/);
    await expect(authenticate({ email: t.admin.email, password: "senha1234" })).rejects.toThrow(/Muitas tentativas/);
  });
});

describe("configurações", () => {
  it("só admin altera; isoladas por loja", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const cfg = { name: "União Grifes", logoUrl: "", address: "Rua A", phone: "", instagram: "@uniao", allowDiscount: false, allowCustomItems: true, allowCancel: true };
    await expect(updateSettings(a.s1Ctx, cfg)).rejects.toThrow(/permissão/);
    await updateSettings(a.adminCtx, cfg);
    expect((await getTenant(a.adminCtx)).allowDiscount).toBe(false);
    expect((await getTenant(b.adminCtx)).allowDiscount).toBe(true);
    expect((await getTenant(b.adminCtx)).name).not.toBe("União Grifes");
    await expect(updateSettings(a.adminCtx, { ...cfg, name: "" })).rejects.toThrow(/Nome/);
  });
});
