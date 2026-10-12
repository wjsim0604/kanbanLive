export interface AppConfig {
  port: number;
  webOrigin: string;
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  port: Number(env.PORT ?? 3000),
  webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
});
