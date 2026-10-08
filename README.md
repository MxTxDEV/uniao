# União Grifes · PDV

PDV SaaS minimalista (multi-tenant) para lojas de moda. Foco: **registrar uma venda em segundos** e enxergar o faturamento. Sem estoque, sem fornecedor, sem ERP.

**Stack:** Next.js 15 (App Router + Server Actions) · TypeScript · Tailwind v4 · Radix/shadcn-style UI · Prisma 6 · PostgreSQL (Neon) · Vitest.

## Rodar localmente
```bash
cp .env.example .env            # ajuste DATABASE_URL / DIRECT_URL / AUTH_SECRET
npm install
npx prisma migrate deploy       # cria as tabelas (ou: npm run db:migrate em dev)
npm run db:seed                 # dados fictícios (loja União Grifes)
npm run dev                     # http://localhost:3000
```
Testes (precisam de um Postgres cujo banco termine em `_test`; padrão `postgresql://postgres@localhost:5433/uniao_test`, ou `TEST_DATABASE_URL`):
```bash
npm test && npm run lint && npm run typecheck
```

## Variáveis de ambiente
| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Conexão do app (no Neon, a string *pooled*) |
| `DIRECT_URL` | Conexão direta (usada pelo `prisma migrate`) |
| `AUTH_SECRET` | Segredo de assinatura da sessão, ≥ 32 caracteres (`openssl rand -base64 48`) |

## Credenciais de teste (seed) — senha `uniao123`
| Perfil | E-mail |
|---|---|
| Admin | admin@uniaogrifes.com.br |
| Vendedor | joao@uniaogrifes.com.br · maria@… · pedro@… |

## Deploy com Docker (Coolify, etc.)
O `Dockerfile` faz o build e, ao iniciar, roda `prisma migrate deploy`. Configure: Build Pack **Dockerfile**, porta **3000**, variáveis `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`. Com `RUN_SEED=true` o container também cria os dados de demonstração (apenas se o banco estiver vazio; login `admin@uniaogrifes.com.br` / `uniao123`).

## Deploy (Vercel + Neon)
1. Crie um projeto no Neon; copie a string *pooled* (`DATABASE_URL`) e a *direct* (`DIRECT_URL`).
2. Aplique as migrations uma vez: `DATABASE_URL=<direct> DIRECT_URL=<direct> npx prisma migrate deploy` (opcional: `npm run db:seed`).
3. Importe o repositório na Vercel e defina `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`.
4. Deploy. O `build` já roda `prisma generate`. Para migrar a cada deploy, use Build Command `prisma migrate deploy && next build`.

### Produção: criar a loja e o admin (sem dados fictícios)
```bash
STORE_NAME="União Grifes" ADMIN_EMAIL=dono@loja.com ADMIN_PASSWORD='senha-forte-123' npm run admin:create
```
(rode apontando `DATABASE_URL` para o banco de produção; no Coolify, pelo terminal do container). Os usuários do seed só existem se você rodar `npm run db:seed`.

## Rotas
`/login` · `/dashboard` · `/nova-venda` (F2) · `/vendas` · `/vendas/[id]` · `/produtos` · `/caixa` · `/funcionarios` · `/relatorios` · `/configuracoes` · `GET /api/relatorios/csv?tipo=vendas|produtos&periodo=…` (admin)

Atalhos: **F2** nova venda · **Ctrl+K** buscar produto · **Enter** adiciona o 1º resultado / confirma · **1–5** forma de pagamento · **Ctrl+Enter** finaliza · **Esc** fecha modal.

## Banco
`Tenant` (config + contador de vendas) → `User`, `Product`, `Sale` → `SaleItem` (`productId` **nullable** = venda avulsa), `CashRegister` → `CashMovement`, `AuditLog`. Valores em `Decimal(12,2)`; CHECKs no banco (total > 0, quantidade > 0…); índice único garante **um caixa aberto por loja**; `Sale` tem número sequencial por loja e chave de idempotência (`requestId`).

## Segurança / multi-tenant
- `tenantId` vem **sempre da sessão** (cookie httpOnly assinado HS256, reconfirmado no banco a cada request: usuário desativado/rebaixado perde acesso na hora). Nunca do cliente.
- Toda consulta/alteração filtra por `tenantId` (inclusive busca por ID); autorização por perfil nos serviços (`src/server/*`), não só na UI. Testes de integração cobrem isolamento e permissões.
- Preço de produto cadastrado vem do banco; total recalculado no servidor. Venda nunca é apagada (só `CANCELED`). Log de auditoria das ações críticas. Limite de tentativas de login. Headers de segurança.

## Fora do MVP (de propósito)
Estoque, compras, fornecedores, contas a pagar/receber, CRM, nota fiscal, logística, marketplace, inventário.

## FUTURAS MELHORIAS (não implementadas)
- Cadastro/auto-cadastro de novas lojas (hoje via seed/SQL) e recuperação de senha por e-mail.
- Upload de imagem/logo (hoje apenas link).
- Saldo do caixa separando dinheiro físico de PIX/cartão.
- Pagamento misto (dividir uma venda em duas formas).
- Impressão térmica/ESC-POS e QR do comprovante; leitor de código de barras dedicado.
- Meta de vendas e comissão por vendedor.
- Rate limiting distribuído (Upstash) e 2FA para admins.
