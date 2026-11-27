import { z } from "zod";
import * as dotenv from "dotenv";
dotenv.config();

const booleanValue = (fallback: boolean) =>
  z.preprocess(
    (value) =>
      value === "true" || value === "yes"
        ? true
        : value === "false" || value === "no"
          ? false
          : value,
    z.boolean().default(fallback),
  );

export const envSchema = z
  .object({
    JWT_BEARER_SECRET: z
      .string()
      .min(32, "JWT_BEARER_SECRET must have at least 32 characters"),
    JWT_TTL: z.coerce.number().int().min(60).max(86400).default(3600),
    SELECTION_RESPONSE_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(2160)
      .default(168),
    PORT: z.coerce.number().int().min(1).max(65535).default(5001),
    HOST: z.string().default("127.0.0.1"),
    PRIVATE_UPLOAD_DIR: z.string().default("uploads/private"),
    UPLOAD_MAX_FILE_MB: z.coerce.number().int().min(1).max(20).default(5),
    UPLOAD_MAX_FILES: z.coerce.number().int().min(1).max(10).default(5),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().int().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    ENABLE_QUEUE: booleanValue(false),
    ENABLE_DEADLINE_ALERTS: booleanValue(true),
    FRONTEND_URL: z.string().default("http://localhost:5173"),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173,http://localhost:3000"),
    DEBUG_LOG: booleanValue(false),
    WARN_LOG: booleanValue(true),
    ERROR_LOG: booleanValue(true),
    REQ_LOG: booleanValue(true),
    LOG_FILE: booleanValue(false),
    MAILER_HOST: z.string().optional(),
    MAILER_PORT: z.coerce.number().optional(),
    MAILER_SECURE: booleanValue(false),
    MAILER_USER: z.string().optional(),
    MAILER_PASSWORD: z.string().optional(),
    MAILER_FROM: z.string().optional(),
  })
  .transform((env) => ({
    ...env,
    REDIS_URL:
      process.env.REDIS_URL ||
      (env.REDIS_PASSWORD
        ? `redis://:${encodeURIComponent(env.REDIS_PASSWORD)}@${env.REDIS_HOST}:${env.REDIS_PORT}`
        : `redis://${env.REDIS_HOST}:${env.REDIS_PORT}`),
  }));

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Do not include environment values or secrets in error output.
  throw new Error(
    "Environment configuration invalid: " +
      parsed.error.issues.map((issue) => issue.path.join(".")).join(", "),
  );
}
export const appConfig = {
  env: parsed.data,
  default_schema_identifier: "public",
  default_migrations_folder: __dirname + "/../database/migrations",
  default_seeders_folder: __dirname + "/../database/seeders",
  tenant_migrations_folder: __dirname + "/../database/tenant_migrations",
  tenant_seeders_folder: __dirname + "/../database/tenant_seeders",
  recommended_bycrypt_rounds: 12,
  email_from: parsed.data.MAILER_FROM ?? "",
};
