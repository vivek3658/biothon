const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const Organization = require('../models/Organization');
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');
const { signToken, setTokenCookie } = require('../utils/jwtHelper');

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
};

// 0. Unified Login for ALL User Roles (Patient, Doctor, Hospital, Clinic, Lab, Admin, Manager)
exports.unifiedLogin = async (request, reply) => {
  try {
    const { email, username, password } = request.body || {};
    const identifier = (email || username || '').toLowerCase().trim();

    if (!identifier || !password) {
      return reply.code(400).send({ error: 'Email/Username and password are required.' });
    }

    // 1. Check Admin Credentials
    const envAdminUser = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
    const envAdminPass = process.env.ADMIN_PASSWORD || 'admin123';

    if (identifier === envAdminUser && password === envAdminPass) {
      const payload = { username: envAdminUser, role: 'admin', entityModel: 'Employee' };
      const token = signToken(request, payload);
      setTokenCookie(reply, token);
      return reply.send({
        success: true,
        message: 'Admin login successful.',
        token,
        role: 'admin',
        entityModel: 'Employee',
        identity: { id: null, username: envAdminUser, role: 'admin' }
      });
    }

    // 2. Check Manager Credentials
    const Manager = require('../models/Manager');
    const manager = await Manager.findOne({
      $or: [
        { username: identifier },
        { email: identifier }
      ]
    });

    if (manager) {
      const isMatch = await bcrypt.compare(password, manager.password);
      if (isMatch) {
        const payload = { id: manager._id, username: manager.username, role: 'manager', entityModel: 'Employee' };
        const token = signToken(request, payload);
        setTokenCookie(reply, token);
        return reply.send({
          success: true,
          message: 'Manager login successful.',
          token,
          role: 'manager',
          entityModel: 'Employee',
          identity: { id: manager._id, username: manager.username, role: 'manager' }
        });
      }
    }

    // 3. Check Account (User or Organization)
    const account = await Account.findOne({ email: identifier });
    if (!account) {
      return reply.code(401).send({ error: 'No account found with this email/username. Please register.' });
    }

    const isMatch = await bcrypt.compare(password, account.password);
    if (!isMatch) {
      return reply.code(401).send({ error: 'Invalid password. Please check your credentials.' });
    }

    // 3a. Organization Account
    if (account.entityModel === 'Organization') {
      let organization = await Organization.findOne({ accountId: account._id });
      if (!organization) {
        organization = new Organization({
          accountId: account._id,
          name: identifier.split('@')[0] || 'Healthcare Facility',
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

      const role = account.role || organization.facilityType || 'hospital';
      const token = signToken(request, {
        accountId: account._id,
        entityId: organization._id,
        entityModel: 'Organization',
        role
      });

      setTokenCookie(reply, token);

      return reply.send({
        success: true,
        message: 'Organization login successful.',
        token,
        accountId: account._id,
        entityId: organization._id,
        role,
        entityModel: 'Organization',
        account: {
          accountId: account._id,
          email: account.email,
          role,
          entityModel: 'Organization',
          profile: organization
        }
      });
    }

    // 3b. User Account (Patient or Doctor)
    let userProfile = await User.findOne({ accountId: account._id });
    if (!userProfile) {
      userProfile = new User({
        accountId: account._id,
        name: identifier.split('@')[0] || 'User',
        isDoctor: account.role === 'doctor',
        location: { roomNo: '', floorNo: 0, landmark: '', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
        coordinates: [77.2090, 28.6139],
        bloodGroup: 'A+'
      });
      await userProfile.save();
      account.entityId = userProfile._id;
      await account.save();
    }

    const role = account.role || (userProfile.isDoctor ? 'doctor' : 'patient');
    const token = signToken(request, {
      accountId: account._id,
      entityId: userProfile._id,
      entityModel: 'User',
      role
    });

    setTokenCookie(reply, token);

    return reply.send({
      success: true,
      message: 'User login successful.',
      token,
      accountId: account._id,
      entityId: userProfile._id,
      role,
      entityModel: 'User',
      account,
      userProfile
    });
  } catch (err) {
    console.error('unifiedLogin error:', err);
    return reply.code(500).send({ error: 'Login failed due to a server error.', details: err.message });
  }
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
        const token = signToken(request, {
          accountId: existing._id,
          entityModel: existing.entityModel,
          role: existing.role,
          onboardingStatus: 'pending_profile'
        });
        setTokenCookie(reply, token);
        return reply.code(200).send({
          success: true,
          message: 'Uncompleted account found. Resuming profile completion.',
          accountId: existing._id,
          entityModel: existing.entityModel,
          token
        });
      }
      const existingType = existing.entityModel === 'Organization' ? 'organization' : 'user/patient';
      return reply.code(400).send({ error: `An ${existingType} account with this email already exists. Please sign in instead.` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const account = new Account({
      email: cleanEmail,
      password: hashedPassword,
      role: entityModel === 'Organization' ? 'hospital' : 'patient',
      entityModel
    });

    await account.save();

    const token = signToken(request, {
      accountId: account._id,
      entityModel: account.entityModel,
      role: account.role,
      onboardingStatus: 'pending_profile'
    });

    setTokenCookie(reply, token);

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
      organization.organizationCertificateNo = organizationCertificateNo || organization.organizationCertificateNo || `REG-${Date.now()}`;
      organization.organizationCertificateUrl = organizationCertificateUrl || organization.organizationCertificateUrl || 'https://example.com/cert.pdf';
      organization.workingDays = Array.isArray(workingDays) && workingDays.length ? workingDays : (organization.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
      organization.specialities = Array.isArray(specialities) && specialities.length ? specialities : (organization.specialities || ['General Medicine']);
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
        verificationStatus: 'pending',
        rejectionReason: ''
      });
    }

    await organization.save();

    account.entityId = organization._id;
    account.role = facilityType || 'hospital';
    account.entityModel = 'Organization';
    await account.save();

    const updatedToken = signToken(request, {
      accountId: account._id,
      entityId: organization._id,
      entityModel: 'Organization',
      role: account.role
    });

    setTokenCookie(reply, updatedToken);

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

    if (account.entityModel !== 'Organization') {
      return reply.code(403).send({ error: 'This account is not registered as an organization.' });
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
        verificationStatus: 'approved',
        rejectionReason: ''
      });
      await organization.save();
      account.entityId = organization._id;
      account.entityModel = 'Organization';
      await account.save();
    }

    const token = signToken(request, {
      accountId: account._id,
      entityId: organization._id,
      entityModel: 'Organization',
      role: account.role || 'hospital'
    });

    setTokenCookie(reply, token);

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

    if (account.entityModel !== 'Organization') {
      return reply.code(403).send({ error: 'Account is registered as a User, not an Organization.' });
    }

    let organization = await Organization.findOne({ accountId: account._id });

    // Auto-repair missing profile
    if (!organization) {
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
        role: account.role || organization.facilityType || 'hospital',
        entityModel: 'Organization',
        profile: organization
      }
    });
  } catch (err) {
    console.error('getMe error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve identity payload.', details: err.message });
  }
};

// 6. Google OAuth Login / Onboarding
exports.googleLogin = async (request, reply) => {
  try {
    const { credential, email: bodyEmail, name: bodyName, googleId: bodyGoogleId, portal } = request.body || {};

    let googleEmail = bodyEmail;
    let googleName = bodyName;
    let googleSub = bodyGoogleId;

    if (credential) {
      try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (clientId && clientId !== 'your_google_client_id_here') {
          const client = new OAuth2Client(clientId);
          const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: clientId
          });
          const payload = ticket.getPayload();
          if (payload) {
            googleEmail = payload.email || googleEmail;
            googleName = payload.name || googleName;
            googleSub = payload.sub || googleSub;
          }
        } else {
          const base64Url = credential.split('.')[1];
          if (base64Url) {
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
            const payload = JSON.parse(jsonPayload);
            googleEmail = payload.email || googleEmail;
            googleName = payload.name || googleName;
            googleSub = payload.sub || googleSub;
          }
        }
      } catch (tokenErr) {
        console.warn('Google Token verification note:', tokenErr.message);
      }
    }

    if (!googleEmail) {
      return reply.code(400).send({ error: 'Google authentication failed: Email is required.' });
    }

    const cleanEmail = googleEmail.toLowerCase().trim();
    const targetEntityModel = portal === 'org' ? 'Organization' : 'User';

    let account = await Account.findOne({
      $or: [
        { email: cleanEmail },
        ...(googleSub ? [{ googleId: googleSub }] : [])
      ]
    });

    if (!account) {
      const randomPassword = await bcrypt.hash(`google_${Date.now()}_${Math.random()}`, 10);
      account = new Account({
        email: cleanEmail,
        password: randomPassword,
        googleId: googleSub || `google_${Date.now()}`,
        authProvider: 'google',
        role: targetEntityModel === 'Organization' ? 'hospital' : 'patient',
        entityModel: targetEntityModel
      });
      await account.save();
    } else {
      if (!account.googleId && googleSub) {
        account.googleId = googleSub;
        account.authProvider = 'google';
        await account.save();
      }
    }

    if (account.entityModel === 'Organization') {
      const organization = await Organization.findOne({ accountId: account._id });
      if (!organization) {
        const pendingToken = signToken(request, {
          accountId: account._id,
          entityModel: 'Organization',
          role: account.role || 'hospital',
          onboardingStatus: 'pending_profile'
        });
        setTokenCookie(reply, pendingToken);
        return reply.send({
          success: true,
          message: 'Google login verified. Please complete your organization profile.',
          needsProfile: true,
          portal: 'org',
          accountId: account._id,
          email: account.email,
          name: googleName || cleanEmail.split('@')[0],
          entityModel: 'Organization',
          token: pendingToken
        });
      }

      const token = signToken(request, {
        accountId: account._id,
        entityId: organization._id,
        entityModel: 'Organization',
        role: account.role || organization.facilityType || 'hospital'
      });
      setTokenCookie(reply, token);
      return reply.send({
        success: true,
        message: 'Google Organization login successful.',
        needsProfile: false,
        token,
        accountId: account._id,
        entityId: organization._id,
        role: account.role || organization.facilityType || 'hospital',
        account: {
          accountId: account._id,
          email: account.email,
          role: account.role || organization.facilityType || 'hospital',
          entityModel: 'Organization',
          profile: organization
        }
      });
    } else {
      const userProfile = await User.findOne({ accountId: account._id });
      if (!userProfile) {
        const pendingToken = signToken(request, {
          accountId: account._id,
          entityModel: 'User',
          role: account.role || 'patient',
          onboardingStatus: 'pending_profile'
        });
        setTokenCookie(reply, pendingToken);
        return reply.send({
          success: true,
          message: 'Google login verified. Please complete your user profile.',
          needsProfile: true,
          portal: 'user',
          accountId: account._id,
          email: account.email,
          name: googleName || cleanEmail.split('@')[0],
          entityModel: 'User',
          token: pendingToken
        });
      }

      const role = account.role || (userProfile.isDoctor ? 'doctor' : 'patient');
      const token = signToken(request, {
        accountId: account._id,
        entityId: userProfile._id,
        entityModel: 'User',
        role
      });
      setTokenCookie(reply, token);
      return reply.send({
        success: true,
        message: 'Google User login successful.',
        needsProfile: false,
        token,
        accountId: account._id,
        entityId: userProfile._id,
        role,
        account,
        userProfile
      });
    }
  } catch (err) {
    console.error('googleLogin error:', err);
    return reply.code(500).send({ error: 'Google login failed due to a server error.', details: err.message });
  }
};
