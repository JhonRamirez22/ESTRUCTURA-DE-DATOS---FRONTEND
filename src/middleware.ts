import { NextRequest, NextResponse } from 'next/server';

/**
 * Reenvía /api al backend añadiendo el secreto de origen: así el backend rechaza cualquier
 * llamada directa y puede confiar en X-Forwarded-For, que Vercel escribe con la IP real.
 * Sin ORIGIN_AUTH_SECRET (desarrollo local) responde el rewrite de next.config.
 */
function proxyToBackend(request: NextRequest): NextResponse {
  const secret = process.env.ORIGIN_AUTH_SECRET?.trim();
  const backend = process.env.PYTHON_API_URL?.trim();
  if (!secret || !backend) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('x-origin-auth', secret);
  const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, backend);
  return NextResponse.rewrite(target, { request: { headers } });
}

export function middleware(request: NextRequest) {
