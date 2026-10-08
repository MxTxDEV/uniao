export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RULE";

/** Erro de negócio com mensagem segura para exibir ao usuário. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function toErrorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  console.error(e);
  return "Ocorreu um erro inesperado. Tente novamente.";
}

/** Executa um serviço e converte exceções em ActionResult (usado pelas Server Actions). */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // redirect()/notFound() do Next lançam erros especiais que não devem ser engolidos
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: toErrorMessage(e) };
  }
}
