const Manager = require('../models/Manager');
const bcrypt = require('bcrypt');

// controllers/employeeAuthController.js
exports.getMe = async (request, reply) => {
  try {
    let token = request.cookies?.token;
    if (!token && request.headers.authorization) {
      token = request.headers.authorization.replace(/^Bearer\s+/i, '').trim();
    }

    if (!token || token === 'undefined' || token === 'null') {
      return reply.code(401).send({ error: 'Unauthorized: No session token found' });
    }

    const decoded = request.server.jwt.decode(token);
    
    if (!decoded) {
      return reply.code(400).send({ error: 'Bad Request: Token decoding failed' });
    }

    return {
      identity: {
        id: decoded.id || null,
        username: decoded.username,
        role: decoded.role
      }
    };
  } catch (err) {
    return reply.code(500).send({ error: 'Internal Server Error during identity extraction' });
  }
};

exports.logout = async (request, reply) => {
  reply.clearCookie('token', { path: '/' });
  return { success: true, message: 'Session successfully revoked' };
};

exports.login = async (request, reply) => {
  const { username, password } = request.body || {};

  if (!username || !password) {
    return reply.code(400).send({ error: 'Username and password are required' });
  }

  let payload = null;
  let selectedRole = null;

  const envAdminUser = process.env.ADMIN_USERNAME || 'admin';
  const envAdminPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === envAdminUser && password === envAdminPass) {
    payload = { username: envAdminUser, role: 'admin' };
    selectedRole = 'admin';
  } else {
    const manager = await Manager.findOne({ username: username.toLowerCase().trim() });
    if (manager) {
      const isMatch = await bcrypt.compare(password, manager.password);
      if (isMatch) {
        payload = { id: manager._id, username: manager.username, role: 'manager' };
        selectedRole = 'manager';
      }
    }
  }

  if (!payload) {
    return reply.code(401).send({ error: 'Unauthorized: Invalid credentials' });
  }

  const token = request.server.jwt.sign(payload);

  reply.setCookie('token', token, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 28800000 // 8 hours
  });

  return { success: true, role: selectedRole, token };
};