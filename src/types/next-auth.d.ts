import type { DefaultSession } from "next-auth";

type Role = "member" | "admin";

declare module "next-auth" {
  interface User {
    role?: Role;
  }
  interface Session {
    user: { role: Role } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
  }
}
