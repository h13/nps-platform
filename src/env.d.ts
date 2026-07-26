type AppEnv = import('./types').Env;

declare namespace Cloudflare {
  interface Env extends AppEnv {}
}

declare module 'cloudflare:test' {
  export const env: AppEnv;
  export const SELF: Fetcher;
  export function createExecutionContext(): ExecutionContext;
  export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;
  export function createScheduledController(options: {
    cron?: string;
    scheduledTime?: number;
  }): ScheduledController;
}
