const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const Organization = require('../models/Organization');

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
};

// 1. Create Base Account
exports.createAccount = async (request, reply) => {
  const { email, password, entityModel } = request.body;

  if (!email || !password || !entityModel) {
    return reply.code(400).send({ error: 'Email, password, and entityModel are required.' });
  }

  if (!['User', 'Organization'].includes(entityModel)) {
    return reply.code(400).send({ error: 'Invalid entityModel value.' });
  }

  const existing = await Account.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return reply.code(400).send({ error: 'An account with this email already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const account = new Account({
    email: email.toLowerCase().trim(),
    password: hashedPassword,
    role: entityModel === 'Organization' ? 'hospital' : 'patient',
    entityModel,
    onboardingStatus: 'pending_profile'
  });

  await account.save();

  const token = request.server.jwt.sign({
    accountId: account._id,
    entityModel: account.entityModel,
    onboardingStatus: account.onboardingStatus
  });

  // Attach token directly to HTTP-only cookie
  reply.setCookie('token', token, COOKIE_OPTIONS);

  return reply.code(201).send({
    success: true,
    message: 'Base account created. Proceed to profile completion.',
    accountId: account._id,
    entityModel: account.entityModel,
    onboardingStatus: account.onboardingStatus
  });
};

// 2. Complete Organization Profile
exports.completeOrgProfile = async (request, reply) => {
  try {
    const { accountId, entityModel } = request.user;

    if (entityModel !== 'Organization') {
      return reply.code(403).send({ error: 'Access denied: Target account is not an Organization.' });
    }

    const {
      name,
      role,
      contactNumber,
      location,
      coordinates,
      organizationCertificateNo,
      organizationCertificateUrl,
      workingDays,
      specialities
    } = request.body;

    const account = await Account.findById(accountId);
    if (!account) {
      return reply.code(404).send({ error: 'Account record not found.' });
    }

    const organization = new Organization({
      accountId: account._id,
      name,
      facilityType: role,
      contactNumber,
      location,
      coordinates: {
        type: 'Point',
        coordinates
      },
      organizationCertificateNo,
      organizationCertificateUrl,
      workingDays,
      specialities,
      verificationStatus: 'pending_approval'
    });

    await organization.save();

    account.entityId = organization._id;
    account.role = role;
    await account.save();

    const updatedToken = request.server.jwt.sign({
      accountId: account._id,
      entityId: account.entityId,
      entityModel: account.entityModel,
      role: account.role,
      verificationStatus: organization.verificationStatus
    });

    reply.setCookie('token', updatedToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    return reply.send({
      success: true,
      message: 'Organization profile completed. Submitted for approval.',
      verificationStatus: organization.verificationStatus
    });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to complete profile.', details: err.message });
  }
};

// 3. Organization Login
exports.organizationLogin = async (request, reply) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return reply.code(400).send({ error: 'Email and password are required.' });
  }

  const account = await Account.findOne({
    email: email.toLowerCase().trim(),
    entityModel: 'Organization'
  });

  if (!account) {
    return reply.code(401).send({ error: 'Invalid organization credentials.' });
  }

  const isMatch = await bcrypt.compare(password, account.password);
  if (!isMatch) {
    return reply.code(401).send({ error: 'Invalid organization credentials.' });
  }

  const token = request.server.jwt.sign({
    accountId: account._id,
    entityId: account.entityId,
    entityModel: account.entityModel,
    role: account.role,
    onboardingStatus: account.onboardingStatus
  });

  reply.setCookie('token', token, COOKIE_OPTIONS);

  return reply.send({
    success: true,
    message: 'Login successful.',
    accountId: account._id,
    role: account.role,
    onboardingStatus: account.onboardingStatus
  });
};

// 4. Logout
exports.logout = async (request, reply) => {
  reply.clearCookie('token', { path: '/' });
  return reply.send({ success: true, message: 'Logged out successfully.' });
};

// 5. Get Current Identity
exports.getMe = async (request, reply) => {
  try {
    const { accountId } = request.user;

    const account = await Account.findById(accountId)
      .select('-password')
      .populate('entityId');

    if (!account) {
      return reply.code(404).send({ error: 'Account identity not found.' });
    }

    return reply.send({
      success: true,
      account: {
        accountId: account._id,
        email: account.email,
        role: account.role,
        entityModel: account.entityModel,
        onboardingStatus: account.onboardingStatus,
        profile: account.entityId
      }
    });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to retrieve identity payload.' });
  }
};