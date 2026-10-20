import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
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
  matcher: ['/((?!api/|_next/|fonts/|sw\\.js|manifest\\.webmanifest|icon\\.svg|favicon\\.ico).*)'],
};
