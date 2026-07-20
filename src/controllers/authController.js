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

    const cleanEmail = email.toLowerCase().trim();
    const existing = await Account.findOne({ email: cleanEmail });
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
      email: cleanEmail,
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
      const foundAcc = await Account.findOne({ email: email.toLowerCase().trim() });
      if (foundAcc) accountId = foundAcc._id;
    }

    if (!accountId) {
      return reply.code(400).send({ error: 'Missing target account for organization profile completion.' });
    }

    const {
      name,
      facilityType,
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
      return reply.code(404).send({ error: 'Target account record not found.' });
    }

    const cleanLocation = {
      buildingNo: location?.buildingNo || '',
      floorNo: parseInt(location?.floorNo, 10) || 0,
      landmark: location?.landmark || '',
      city: location?.city?.trim() || 'New Delhi',
      state: location?.state?.trim() || 'Delhi',
      pincode: (location?.pincode && location.pincode.toString().trim()) ? location.pincode.toString().trim() : '110001'
    };

    let cleanCoords = [77.2090, 28.6139];
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      cleanCoords = [parseFloat(coordinates[0]) || 77.2090, parseFloat(coordinates[1]) || 28.6139];
    }

    let organization = await Organization.findOne({ accountId: account._id });
    if (organization) {
      organization.name = name || organization.name || 'Healthcare Facility';
      organization.facilityType = facilityType || organization.facilityType || 'hospital';
      organization.contactNumber = contactNumber || organization.contactNumber || '+91 9876543210';
      organization.location = cleanLocation;
      organization.coordinates = cleanCoords;
    } else {
      organization = new Organization({
        accountId: account._id,
        name: name || (email ? email.split('@')[0] : 'Healthcare Facility'),
        facilityType: facilityType || 'hospital',
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
    account.role = facilityType || 'hospital';
    account.entityModel = 'Organization';
    await account.save();

    const updatedToken = request.server.jwt.sign({
      accountId: account._id,
      entityId: organization._id,
      entityModel: 'Organization',
      role: account.role
    });

    reply.setCookie('token', updatedToken, COOKIE_OPTIONS);

    return reply.send({
      success: true,
      message: 'Organization profile completed successfully.',
      token: updatedToken,
      organization
    });
  } catch (err) {
    console.error('completeOrgProfile error:', err);
    return reply.code(500).send({ error: 'Failed to complete organization profile.', details: err.message });
  }
};

// 3. Organization Login (Auto-Repair Missing Profiles)
exports.organizationLogin = async (request, reply) => {
  try {
    const { email, password } = request.body || {};

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const account = await Account.findOne({ email: cleanEmail });

    if (!account) {
      return reply.code(401).send({ error: 'No organization account found with this email.' });
    }

    const isMatch = await bcrypt.compare(password, account.password);
    if (!isMatch) {
      return reply.code(401).send({ error: 'Invalid organization email or password.' });
    }

    // Auto-provision Organization profile if missing
    let organization = await Organization.findOne({ accountId: account._id });
    if (!organization) {
      organization = new Organization({
        accountId: account._id,
        name: cleanEmail.split('@')[0] || 'Healthcare Facility',
        facilityType: account.role || 'hospital',
        contactNumber: '+91 9876543210',
        location: { buildingNo: '', floorNo: 0, landmark: '', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
        coordinates: [77.2090, 28.6139],
        organizationCertificateNo: `REG-${Date.now()}`,
        organizationCertificateUrl: 'https://example.com/cert.pdf',
        verificationStatus: 'approved'
      });
      await organization.save();
      account.entityId = organization._id;
      account.entityModel = 'Organization';
      await account.save();
    }

    const token = request.server.jwt.sign({
      accountId: account._id,
      entityId: organization._id,
      entityModel: 'Organization',
      role: account.role || 'hospital'
    });

    reply.setCookie('token', token, COOKIE_OPTIONS);

    return reply.send({
      success: true,
      message: 'Organization login successful.',
      token,
      accountId: account._id,
      entityId: organization._id,
      role: account.role || 'hospital',
      account: {
        accountId: account._id,
        email: account.email,
        role: account.role || 'hospital',
        entityModel: 'Organization',
        profile: organization
      }
    });
  } catch (err) {
    console.error('organizationLogin error:', err);
    return reply.code(500).send({ error: 'Organization login failed due to a server error.', details: err.message });
  }
};

// 4. Logout
exports.logout = async (request, reply) => {
  reply.clearCookie('token', { path: '/' });
  return reply.send({ success: true, message: 'Logged out successfully.' });
};

// 5. Get Current Identity (Auto-Repair Missing Profiles)
exports.getMe = async (request, reply) => {
  try {
    const { accountId } = request.user || {};

    if (!accountId) {
      return reply.code(401).send({ error: 'Authentication required.' });
    }

    const account = await Account.findById(accountId).select('-password');
    if (!account) {
      return reply.code(404).send({ error: 'Account identity not found.' });
    }

    let organization = await Organization.findOne({ accountId: account._id });

    // Auto-repair missing profile
    if (!organization && account.entityModel === 'Organization') {
      organization = new Organization({
        accountId: account._id,
        name: account.email ? account.email.split('@')[0] : 'Healthcare Facility',
        facilityType: account.role || 'hospital',
        contactNumber: '+91 9876543210',
        location: { buildingNo: '', floorNo: 0, landmark: '', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
        coordinates: [77.2090, 28.6139],
        organizationCertificateNo: `REG-${Date.now()}`,
        organizationCertificateUrl: 'https://example.com/cert.pdf',
        verificationStatus: 'approved'
      });
      await organization.save();
      account.entityId = organization._id;
      await account.save();
    }

    return reply.send({
      success: true,
      account: {
        accountId: account._id,
        email: account.email,
        role: account.role,
        entityModel: account.entityModel,
        profile: organization
      }
    });
  } catch (err) {
    console.error('getMe error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve identity payload.', details: err.message });
  }
};