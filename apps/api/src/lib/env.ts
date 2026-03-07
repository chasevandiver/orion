export function validateEnv(context: string) {
  const required = ["DATABASE_URL"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`[${context}] Missing required env vars: ${missing.join(", ")}`);
  }
}
