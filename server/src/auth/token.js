import jwt from "jsonwebtoken";

const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

export function createSessionToken({ secret, sessionId, userId, role, warehouseIds, expiresInSeconds = DEFAULT_TTL_SECONDS }) {
  return jwt.sign(
    {
      sid: sessionId,
      role,
      warehouseIds
    },
    secret,
    {
      subject: String(userId),
      expiresIn: expiresInSeconds,
      issuer: "microtek-idm"
    }
  );
}

export function verifySessionToken({ secret, token }) {
  return jwt.verify(token, secret, { issuer: "microtek-idm" });
}
