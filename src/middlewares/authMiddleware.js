// middleware/authMiddleware.js

// 1. Primary Authentication Handler
async function authenticate(request, reply) {
  try {
    const token = request.cookies?.token || request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return reply.code(401).send({ error: 'Authentication required. No token provided.' });
    }

    const decoded = await request.server.jwt.verify(token);
    request.user = decoded;
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid or expired authentication token.' });
  }
}

// 2. Role Authorization Factory (Assumes authenticate has already attached request.user)
const verifyRole = (allowedRoles) => {
  return async (request, reply) => {
    try {
      // Extract from HTTP-only cookie or Authorization header
      const token = request.cookies?.token || request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return reply.code(401).send({ error: 'Authentication required. Missing token.' });
      }

      // Verify token signature and attach payload
      const decoded = await request.server.jwt.verify(token);
      request.user = decoded;

      // Evaluate role boundaries
      if (!allowedRoles.includes(request.user.role)) {
        return reply.code(403).send({ error: 'Forbidden: Insufficient privileges.' });
      }
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized: Invalid or expired token.' });
    }
  };
};

// 3. Consolidated Module Export
module.exports = {
  authenticate,
  verifyRole,
  isAdmin: verifyRole(['admin']),
  isManager: verifyRole(['manager']),
  isDoctor: verifyRole(['doctor']),
  isPatient: verifyRole(['patient']),
  isEmployee: verifyRole(['admin', 'manager'])
};