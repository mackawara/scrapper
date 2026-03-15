export { auth as middleware } from "@/auth";

export const config = {
  // Protect all routes except public assets, API auth routes, and the sign-in page
  matcher: [
    "/((?!api/auth|signin|_next/static|_next/image|favicon.ico|placeholder.png).*)",
  ],
};
