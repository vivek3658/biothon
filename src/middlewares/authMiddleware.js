// middleware/authMiddleware.js
const verifyRole = (allowedRoles) => {
  return async (request, reply) => {
    try {
      const token = request.cookies.token;
      if (!token) {
        return reply.code(401).send({ error: 'Unauthorized: Missing session token' });
      }

      // Decrypt the token via Fastify JWT configuration
      const decoded = await request.server.jwt.verify(token);
      request.user = decoded;

      // Evaluate role boundaries
      if (!allowedRoles.includes(request.user.role)) {
        return reply.code(403).send({ error: 'Forbidden: Insufficient privileges' });
      }
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized: Session invalid or expired' });
    }
  };
};

module.exports = {
  isAdmin: verifyRole(['admin']),
  isManager: verifyRole(['manager']),
  isDoctor: verifyRole(['doctor']),
  isPatient: verifyRole(['patient']),
  isEmployee: verifyRole(['admin', 'manager'])
};