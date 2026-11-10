// Runs once when a server instance starts. Logs any missing or malformed environment variable by name (see
// src/lib/env.ts) without stopping the server; production builds on Vercel already refuse to deploy with one.
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { checkEnv } = await import("./lib/env");
    const env = checkEnv(process.env);
    if (!env.ok) console.error(`Environment check failed:\n- ${env.problems.join("\n- ")}`);
}
