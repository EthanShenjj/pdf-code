import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? "paperkit-local-development-secret-change-before-deploy",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, disableSignUp: process.env.ALLOW_SIGN_UP !== "true" },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
});
