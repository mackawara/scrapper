import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { isGitHubUserAllowed } from "@/lib/allowedEmails";

export const authConfig: NextAuthConfig = {
  providers: [GitHub],
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    signIn({ user, profile }) {
      const username = (profile as { login?: string })?.login ?? "";
      return isGitHubUserAllowed(username, user.email ?? null);
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};
