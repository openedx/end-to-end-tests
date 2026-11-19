/**
 * The JSON Web Token pieces an LTI 1.3 tool needs — RS256 signing, decoding and
 * verification against a JWKS — on `node:crypto` alone, so the test tool has no
 * dependency beyond Node itself. Runs natively on Node 24 (type stripping).
 */

import { createPublicKey, sign, verify, type KeyObject, type webcrypto } from 'node:crypto';

export interface DecodedJwt {
  readonly header: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>>;
  /** `<header>.<payload>`, the bytes the signature covers. */
  readonly signedPart: string;
  readonly signature: Buffer;
}

/** A JSON Web Key Set, as an LTI platform publishes its keys. */
export interface Jwks {
  readonly keys: readonly webcrypto.JsonWebKey[];
}

const base64url = (data: string | Buffer): string => Buffer.from(data).toString('base64url');

/** Signs `payload` as an RS256 JWT whose header names `kid`. */
export function signJwt(
  privateKey: KeyObject,
  kid: string,
  payload: Readonly<Record<string, unknown>>,
): string {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const signedPart = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign('RSA-SHA256', Buffer.from(signedPart), privateKey);
  return `${signedPart}.${base64url(signature)}`;
}

/** Splits and parses a compact JWT without checking anything. Throws on a malformed one. */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('A JWT has three dot-separated parts.');
  const [header, payload, signature] = parts as [string, string, string];
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>,
    signedPart: `${header}.${payload}`,
    signature: Buffer.from(signature, 'base64url'),
  };
}

/**
 * Verifies an RS256 JWT against `jwks`, choosing the key by the header's `kid`
 * (the only key when the header names none). Returns the decoded token, or
 * throws naming what failed. Checks the signature and `exp`; the claims an LTI
 * message must carry are the caller's to check.
 */
export function verifyJwt(token: string, jwks: Jwks, nowSeconds: number): DecodedJwt {
  const decoded = decodeJwt(token);
  if (decoded.header.alg !== 'RS256') {
    throw new Error(`Unsupported JWT alg ${String(decoded.header.alg)}.`);
  }
  const kid = decoded.header.kid;
  const jwk =
    typeof kid === 'string'
      ? jwks.keys.find((key) => (key as { kid?: unknown }).kid === kid)
      : jwks.keys.at(0);
  if (jwk === undefined) throw new Error(`No key with kid ${String(kid)} in the platform keyset.`);
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (!verify('RSA-SHA256', Buffer.from(decoded.signedPart), key, decoded.signature)) {
    throw new Error('The JWT signature does not verify.');
  }
  const exp = decoded.payload.exp;
  if (typeof exp === 'number' && exp < nowSeconds) throw new Error('The JWT has expired.');
  return decoded;
}
