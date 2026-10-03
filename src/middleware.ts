import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Redirect any request to the blocked routes back to the homepage
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    // "/admin/:path*",
    // "/apply/:path*",
    // "/contact/:path*",
    // "/faq/:path*",
    // "/how-it-works/:path*",
    // "/loan/:path*",
    // "/status/:path*",
    // "/rates-and-fees",
    // "/loan-status",
    // "/legal/:path*",
  ],
};
