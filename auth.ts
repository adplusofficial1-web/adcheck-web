import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auth.js (NextAuth v5) config for the App Router.
// Google provider reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from the
// environment automatically — see .env.example.
export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [Google],
    pages: {
          signIn: "/login",
    },
    callbacks: {
          // TODO: once businesses have a real 1-to-1 mapping to Google accounts
      // (rather than the single DEMO_BUSINESS_EMAIL used throughout lib/db.ts
      // and the API routes today), look the business up here by
      // session.user.email — see lib/db.ts:getBusinessByEmail — and attach its
      // id to the session so pages/routes stop hardcoding the demo tenant.
      async session({ session }) {
              return session;
      },
    },
});
