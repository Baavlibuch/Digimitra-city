import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login", "/register", "/verify"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  const hasSession = request.cookies.get("dm_auth")?.value === "1"

  if (isPublicPath && hasSession) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  if (!isPublicPath && !hasSession && !pathname.startsWith("/_next") && pathname !== "/favicon.ico") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image).*)"],
}
