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
  if (request.nextUrl.pathname.startsWith('/api/')) return proxyToBackend(request);
  const nonce = btoa(crypto.randomUUID());
  const development = process.env.NODE_ENV !== 'production';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    // MapLibre y Motion posicionan controles mediante estilos inline, no scripts inline.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tiles.openfreemap.org",
    "font-src 'self'",
    `connect-src 'self' https://tiles.openfreemap.org${development ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...development ? [] : ['upgrade-insecure-requests'],
  ].join('; ');
  const headers = new Headers(request.headers);
  // Next extrae el nonce de esta cabecera al renderizar sus scripts de hidratación.
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(
    process.env.CSP_MODE === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
    policy,
  );
  // El documento y su nonce son indivisibles y no deben reutilizarse desde CDN/PWA.
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/api/:path*', '/((?!api/|_next/|fonts/|sw\\.js|manifest\\.webmanifest|icon\\.svg|favicon\\.ico).*)'],
};
