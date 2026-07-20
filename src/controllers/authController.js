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

// 1. Create Base Account (or Resume Profile Completion)
exports.createAccount = async (request, reply) => {
  try {
    const { email, password, entityModel } = request.body || {};

    if (!email || !password || !entityModel) {
      return reply.code(400).send({ error: 'Email, password, and entityModel are required.' });
    }

    if (!['User', 'Organization'].includes(entityModel)) {
      return reply.code(400).send({ error: 'Invalid entityModel value.' });
    }

    const existing = await Account.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      if (!existing.entityId) {
        const token = request.server.jwt.sign({
          accountId: existing._id,
          entityModel: existing.entityModel,
          role: existing.role,
          onboardingStatus: 'pending_profile'
        });
        reply.setCookie('token', token, COOKIE_OPTIONS);
        return reply.code(200).send({
          success: true,
          message: 'Uncompleted account found. Resuming profile completion.',
          accountId: existing._id,
          entityModel: existing.entityModel,
          token
        });
      }
      return reply.code(400).send({ error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const account = new Account({
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: entityModel === 'Organization' ? 'hospital' : 'patient',
      entityModel
    });

    await account.save();

    const token = request.server.jwt.sign({
      accountId: account._id,
      entityModel: account.entityModel,
      role: account.role,
      onboardingStatus: 'pending_profile'
    });

    reply.setCookie('token', token, COOKIE_OPTIONS);

    return reply.code(201).send({
      success: true,
      message: 'Base account created. Proceed to profile completion.',
      accountId: account._id,
      entityModel: account.entityModel,
      token
    });
  } catch (err) {
    console.error('createAccount error:', err);
    return reply.code(500).send({ error: 'Failed to create base account.', details: err.message });
  }
};

// 2. Complete Organization Profile
exports.completeOrgProfile = async (request, reply) => {
  try {
    let accountId = request.user?.accountId;
    const { email } = request.body || {};

    if (!accountId && request.body?.accountId) {
      accountId = request.body.accountId;
    }
    if (!accountId && email) {
      const foundAcc = await Account.findOne({ email: email.toLowerCase().trim(), entityModel: 'Organization' });
      if (foundAcc) accountId = foundAcc._id;
    }

    if (!accountId) {
      return reply.code(400).send({ error: 'Missing target account for organization profile completion.' });
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
    } = request.body || {};

    const account = await Account.findById(accountId);
    if (!account) {
      return reply.code(404).send({ error: 'Account record not found.' });
    }

    const cleanLocation = {
      buildingNo: location?.buildingNo || '1',
      floorNo: parseInt(location?.floorNo, 10) || 0,
      landmark: location?.landmark || 'City Center',
      city: location?.city?.trim() || 'New Delhi',
      state: location?.state?.trim() || 'Delhi',
      pincode: (location?.pincode && location.pincode.toString().trim()) ? location.pincode.toString().trim() : '110001'
    };

    let cleanCoords = [77.2090, 28.6139];
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      cleanCoords = [parseFloat(coordinates[0]) || 77.2090, parseFloat(coordinates[1]) || 28.6139];
    }

    // Check if org profile already exists (resume scenario)
    let organization = await Organization.findOne({ accountId: account._id });
    if (organization) {
      organization.name = name || organization.name;
      organization.facilityType = role || organization.facilityType;
      organization.contactNumber = contactNumber || organization.contactNumber;
      organization.location = cleanLocation;
      organization.coordinates = cleanCoords;
      organization.organizationCertificateNo = organizationCertificateNo || organization.organizationCertificateNo;
      organization.organizationCertificateUrl = organizationCertificateUrl || organization.organizationCertificateUrl;
      if (workingDays) organization.workingDays = workingDays;
      if (specialities) organization.specialities = specialities;
    } else {
      organization = new Organization({
        accountId: account._id,
        name: name || 'Healthcare Facility',
        facilityType: role || 'hospital',
        contactNumber: contactNumber || '+91 9876543210',
        location: cleanLocation,
        coordinates: cleanCoords,
        organizationCertificateNo: organizationCertificateNo || `REG-${Date.now()}`,
        organizationCertificateUrl: organizationCertificateUrl || 'https://example.com/cert.pdf',
        workingDays: workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        specialities: specialities || ['General Medicine'],
        verificationStatus: 'pending'
      });
    }

    await organization.save();

    account.entityId = organization._id;
    account.role = role || 'hospital';
    await account.save();

    const updatedToken = request.server.jwt.sign({
      accountId: account._id,
      entityId: account.entityId,
      entityModel: account.entityModel,
      role: account.role,
      verificationStatus: organization.verificationStatus
    });

    reply.setCookie('token', updatedToken, COOKIE_OPTIONS);

    return reply.send({
      success: true,
      message: 'Organization profile completed. Submitted for approval.',
      verificationStatus: organization.verificationStatus,
      token: updatedToken
    });
  } catch (err) {
    console.error('completeOrgProfile error:', err);
    return reply.code(500).send({ error: 'Failed to complete organization profile.', details: err.message });
  }
};

// 3. Organization Login
exports.organizationLogin = async (request, reply) => {
  try {
    const { email, password } = request.body || {};

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
      role: account.role
    });

    reply.setCookie('token', token, COOKIE_OPTIONS);

    return reply.send({
      success: true,
      message: 'Login successful.',
      accountId: account._id,
      role: account.role,
      token
    });
  } catch (err) {
    console.error('organizationLogin error:', err);
    return reply.code(500).send({ error: 'Organization login failed.', details: err.message });
  }
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
        profile: account.entityId
      }
    });
  } catch (err) {
    console.error('getMe error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve identity payload.' });
  }
};