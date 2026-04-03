/**
 * Figma OAuth 2.0 + PKCE authentication module.
 *
 * Stores credentials in ~/.config/figcraft/credentials.json (mode 0600).
 * Supports automatic token refresh with mutex to prevent concurrent refreshes.
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ─── Config ───

const FIGMA_OAUTH_AUTHORIZE = 'https://www.figma.com/oauth';
const FIGMA_OAUTH_TOKEN = 'https://api.figma.com/v1/oauth/token';
const REDIRECT_URI = 'http://localhost:9274/callback';
const OAUTH_PORT = 9274;
const SCOPES =
  'current_user:read,file_content:read,file_metadata:read,file_comments:read,file_comments:write,file_versions:read,library_assets:read,library_content:read,team_library_content:read,file_dev_resources:read,file_dev_resources:write,projects:read,webhooks:read,webhooks:write';

function getClientId(): string {
  const id = process.env.FIGMA_CLIENT_ID;
  if (!id) throw new Error('FIGMA_CLIENT_ID environment variable is not set.');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.FIGMA_CLIENT_SECRET;
  if (!secret) throw new Error('FIGMA_CLIENT_SECRET environment variable is not set.');
  return secret;
}

// ─── Types ───

interface Credentials {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

// ─── Storage ───

function credentialsDir(): string {
  return join(homedir(), '.config', 'figcraft');
}

function credentialsPath(): string {
  return join(credentialsDir(), 'credentials.json');
}

function loadCredentials(): Credentials | null {
  try {
    const raw = readFileSync(credentialsPath(), 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

function saveCredentials(creds: Credentials): void {
  const dir = credentialsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${credentialsPath()}.tmp`;
  writeFileSync(tmp, JSON.stringify(creds, null, 2), { mode: 0o600 });
  renameSync(tmp, credentialsPath());
}

export function clearCredentials(): void {
  try {
    unlinkSync(credentialsPath());
  } catch {
    /* ignore */
  }
}

// ─── PKCE ───

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// ─── Token refresh ───

let refreshPromise: Promise<string> | null = null;

async function refreshToken(refreshTok: string): Promise<Credentials> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const res = await fetch(FIGMA_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTok,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      clearCredentials();
      throw new Error('Refresh token expired or revoked. Please run figma_login again.');
    }
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const creds: Credentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshTok,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveCredentials(creds);
  return creds;
}

// ─── Bridge token persistence ───

function bridgeTokenPath(): string {
  return join(credentialsDir(), 'bridge-token.json');
}

/** Save the API token received from Plugin UI to disk for offline use. */
export function saveBridgeToken(token: string): void {
  const dir = credentialsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${bridgeTokenPath()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ token, savedAt: Date.now() }), { mode: 0o600 });
  renameSync(tmp, bridgeTokenPath());
  console.error('[FigCraft auth] Bridge token persisted to disk');
}

/** Load persisted bridge token from disk. */
function loadBridgeToken(): string | null {
  try {
    const raw = readFileSync(bridgeTokenPath(), 'utf-8');
    const data = JSON.parse(raw) as { token: string };
    return data.token || null;
  } catch {
    return null;
  }
}

// ─── Bridge token injection ───

let bridgeTokenFn: (() => string | null) | null = null;

/** Register a function that returns the API token received from Plugin UI. */
export function setBridgeTokenProvider(fn: () => string | null): void {
  bridgeTokenFn = fn;
}

// ─── Public API ───

/**
 * Get a valid Figma API token.
 * Priority: 1) FIGMA_API_TOKEN env → 2) Live bridge token → 3) Persisted bridge token → 4) OAuth.
 */
export async function getToken(): Promise<string> {
  // PAT takes priority — simplest setup, works on all plans
  const pat = process.env.FIGMA_API_TOKEN;
  if (pat) return pat;

  // Live plugin UI token (sent via WebSocket)
  const bridgeToken = bridgeTokenFn?.();
  if (bridgeToken) return bridgeToken;

  // Persisted bridge token (plugin was online before, token saved to disk)
  const persistedToken = loadBridgeToken();
  if (persistedToken) return persistedToken;

  // Fall back to OAuth credentials
  const creds = loadCredentials();
  if (!creds) {
    throw new Error(
      'Not authenticated with Figma. Set FIGMA_API_TOKEN env var, configure token in FigCraft plugin UI, or run the figma_login tool for OAuth.',
    );
  }

  // Refresh if within 5 minutes of expiry
  if (creds.expires_at - Date.now() < 5 * 60 * 1000) {
    if (!refreshPromise) {
      refreshPromise = refreshToken(creds.refresh_token)
        .then((c) => c.access_token)
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  return creds.access_token;
}

/**
 * Start OAuth 2.0 + PKCE flow.
 * Returns the authorization URL immediately. Starts a temporary HTTP server
 * on localhost:9274 to receive the callback, exchange the code, and store credentials.
 */
export function startOAuthFlow(): { url: string; completion: Promise<{ ok: true }> } {
  const clientId = getClientId();
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = randomBytes(16).toString('hex');

  const url = `${FIGMA_OAUTH_AUTHORIZE}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_type: 'code',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })}`;

  const completion = new Promise<{ ok: true }>((resolve, reject) => {
    let server: Server;
    const timeout = setTimeout(
      () => {
        server?.close();
        reject(new Error('OAuth flow timed out after 5 minutes. Please try figma_login again.'));
      },
      5 * 60 * 1000,
    );

    server = createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url!, `http://localhost:${OAUTH_PORT}`);
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');

        if (returnedState !== state) {
          res.writeHead(400);
          res.end('Invalid state parameter. Please retry figma_login.');
          return;
        }

        if (!code) {
          const error = reqUrl.searchParams.get('error');
          res.writeHead(400);
          res.end(`Authorization failed: ${error || 'no code received'}`);
          reject(new Error(`OAuth denied: ${error}`));
          clearTimeout(timeout);
          server.close();
          return;
        }

        // Exchange code for token
        const clientSecret = getClientSecret();
        const tokenRes = await fetch(FIGMA_OAUTH_TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenRes.ok) {
          const body = await tokenRes.text().catch(() => '');
          res.writeHead(500);
          res.end(`Token exchange failed: ${body}`);
          reject(new Error(`Token exchange failed (${tokenRes.status}): ${body}`));
          clearTimeout(timeout);
          server.close();
          return;
        }

        const data = (await tokenRes.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        saveCredentials({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
        });

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Figma authorization successful!</h2><p>You can close this tab.</p></body></html>');

        clearTimeout(timeout);
        server.close();
        resolve({ ok: true });
      } catch (err) {
        res.writeHead(500);
        res.end('Internal error');
        clearTimeout(timeout);
        server.close();
        reject(err);
      }
    });

    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      console.error(`[FigCraft auth] OAuth callback server listening on 127.0.0.1:${OAUTH_PORT}`);
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
    });
  });

  return { url, completion };
}

/**
 * Get current auth status.
 * Reports the highest-priority auth method available.
 */
export function getAuthStatus(): {
  method: 'pat' | 'bridge' | 'bridge-persisted' | 'oauth' | 'none';
  expiresAt?: number;
} {
  if (process.env.FIGMA_API_TOKEN) return { method: 'pat' };
  const bridgeToken = bridgeTokenFn?.();
  if (bridgeToken) return { method: 'bridge' };
  const persistedToken = loadBridgeToken();
  if (persistedToken) return { method: 'bridge-persisted' };
  const creds = loadCredentials();
  if (creds) return { method: 'oauth', expiresAt: creds.expires_at };
  return { method: 'none' };
}
