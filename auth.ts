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
        // Route ALL auth errors (OAuth callback failures, PKCE/state cookie
        // issues, etc.) back to /login with an ?error=... code instead of
        // Auth.js's default unstyled crash page. /login reads that code and
        // shows a friendly Thai retry message — see app/login/page.tsx.
        error: "/login",
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
