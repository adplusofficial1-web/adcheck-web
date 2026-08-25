import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auth.js (NextAuth v5) config for the App Router.
// Google provider reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from the
// environment automatically — see .env.example.
export const { handlers, signIn, signOut, auth } = NextAuth({
    trustHost: true,
    providers: [Google],
    pages: {
          signIn: "/login",
    },
    callbacks: {
          // Businesses map 1:1 to the Google account that owns them
      // (contact_email is UNIQUE) — see lib/currentBusiness.ts:
      // getCurrentBusiness(), which every page/API route calls to resolve
      // "whose data is this" from the session, lazily creating the business
      // row (with its 5 free welcome credits) the first time a new email
      // is seen. That lookup deliberately isn't done here: this callback
      // runs as part of the middleware/edge auth bundle (middleware.ts
      // re-exports `auth` from this file), and lib/db.ts's Neon client is
      // best kept out of that bundle rather than relied on to behave there.
      async session({ session }) {
              return session;
      },
    },
});
