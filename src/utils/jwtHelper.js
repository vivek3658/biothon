const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

exports.signToken = (request, payload) => {
  try {
    if (request?.jwtSign) {
      return request.jwtSign(payload);
    }
    if (request?.server?.jwt?.sign) {
      return request.server.jwt.sign(payload);
    }
  } catch (e) {}

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

exports.verifyToken = async (request, token) => {
  try {
    if (request?.server?.jwt?.verify) {
      return await request.server.jwt.verify(token);
    }
  } catch (e) {}

  return jwt.verify(token, JWT_SECRET);
};

exports.setTokenCookie = (reply, token) => {
  try {
    if (reply && typeof reply.setCookie === 'function') {
      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'none',
        secure: true
      });
    }
  } catch (e) {
    // Fail-safe cookie handling for serverless environments
  }
};
