// middleware/authMiddleware.js

async function extractToken(request) {
  let token = request.cookies?.token;
  if (!token || token === 'undefined' || token === 'null') {
    if (request.headers.authorization) {
      token = request.headers.authorization.replace(/^Bearer\s+/i, '').trim();
    }
  }
  if (!token || token === 'undefined' || token === 'null') {
    if (request.headers['x-access-token']) {
      token = request.headers['x-access-token'];
    }
  }
  if (!token || token === 'undefined' || token === 'null') {
    if (request.query?.token) {
      token = request.query.token;
    }
  }
  if (token === 'undefined' || token === 'null') {
    token = null;
  }
  return token;
}

// 1. Primary Authentication Handler
async function authenticate(request, reply) {
  try {
    const token = await extractToken(request);

    if (!token) {
      return reply.code(401).send({ error: 'Authentication required. No token provided.' });
    }

    const decoded = await request.server.jwt.verify(token);
    request.user = decoded;
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid or expired authentication token.' });
  }
}

// 2. Role Authorization Factory
const verifyRole = (allowedRoles) => {
  return async (request, reply) => {
    try {
      const token = await extractToken(request);

      if (!token) {
        return reply.code(401).send({ error: 'Authentication required. Missing token.' });
      }

      const decoded = await request.server.jwt.verify(token);
      request.user = decoded;

      if (!allowedRoles.includes(request.user.role)) {
        return reply.code(403).send({ error: 'Forbidden: Insufficient privileges.' });
      }
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized: Invalid or expired token.' });
    }
  };
};

module.exports = {
  authenticate,
  verifyRole,
  isAdmin: verifyRole(['admin']),
  isManager: verifyRole(['manager']),
  isDoctor: verifyRole(['doctor']),
  isPatient: verifyRole(['patient']),
  isEmployee: verifyRole(['admin', 'manager'])
};