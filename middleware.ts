export { auth as middleware } from "@/auth";

// Everything a signed-in business owner uses. /, /login, and /pricing stay
// public. Add new authenticated routes here as they're built.
export const config = {
    matcher: [
          "/dashboard/:path*",
          "/history/:path*",
          "/settings/:path*",
          "/upload/:path*",
          "/results/:path*",
          "/checkout/:path*",
          "/processing/:path*",
        ],
};
