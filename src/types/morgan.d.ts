declare module 'morgan' {
  interface MorganRequestLike {
    headers: Record<string, string | string[] | undefined>;
    method?: string;
    url?: string;
  }

  interface MorganResponseLike {
    statusCode?: number;
    getHeader?(name: string): string | number | string[] | undefined;
    headersSent?: boolean;
    locals?: Record<string, unknown>;
  }

  type TokenCallback = (
    request: MorganRequestLike,
    response: MorganResponseLike,
  ) => string | undefined;

  type CompiledFormat = (
    tokens: Record<
      string,
      (
        request: MorganRequestLike,
        response: MorganResponseLike,
        arg?: string,
      ) => string | undefined
    >,
    request: MorganRequestLike,
    response: MorganResponseLike,
  ) => string;

  interface MorganStatic {
    token(name: string, callback: TokenCallback): void;
    compile(format: string): CompiledFormat;
  }

  const morgan: MorganStatic;
  export default morgan;
}
