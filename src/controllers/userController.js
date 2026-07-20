const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const User = require('../models/User');
const Organization = require('../models/Organization');

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
};

// 1. User Login (Patient or Doctor)
exports.userLogin = async (request, reply) => {
  try {
    const { email, password } = request.body || {};

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Find account by email
    const account = await Account.findOne({ email: cleanEmail });
    if (!account) {
      return reply.code(401).send({ error: 'No user account found with this email. Please register.' });
    }

    const isMatch = await bcrypt.compare(password, account.password);
    if (!isMatch) {
      return reply.code(401).send({ error: 'Invalid email or password.' });
    }

    // Auto-provision User profile if missing
    let userProfile = await User.findOne({ accountId: account._id });
    if (!userProfile) {
      userProfile = new User({
        accountId: account._id,
        name: cleanEmail.split('@')[0] || 'User',
        isDoctor: account.role === 'doctor',
        location: { roomNo: '', floorNo: 0, landmark: '', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
        coordinates: [77.2090, 28.6139],
        bloodGroup: 'A+'
      });
      await userProfile.save();
      account.entityId = userProfile._id;
      await account.save();
    }

    const token = request.server.jwt.sign({
      accountId: account._id,
      entityId: userProfile._id,
      entityModel: account.entityModel || 'User',
      role: account.role || (userProfile.isDoctor ? 'doctor' : 'patient')
    });

    reply.setCookie('token', token, COOKIE_OPTIONS);

    return reply.send({
      success: true,
      message: 'User login successful.',
      token,
      accountId: account._id,
      entityId: userProfile._id,
      role: account.role || (userProfile.isDoctor ? 'doctor' : 'patient'),
      account,
      userProfile
    });
  } catch (err) {
    console.error('userLogin error:', err);
    return reply.code(500).send({ error: 'Login failed due to a server error.', details: err.message });
  }
};

// 2. Complete User Profile (Patient or Doctor)
exports.completeUserProfile = async (request, reply) => {
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
      return reply.code(400).send({ error: 'Missing target account identity for profile completion.' });
    }

    const {
      name,
      isDoctor,
      location,
      coordinates,
      bloodGroup,
      certificateNo,
      certificateDoc,
      affiliateOrganization,
      speciality
    } = request.body || {};

    const account = await Account.findById(accountId);
    if (!account) {
      return reply.code(404).send({ error: 'Target account record not found.' });
    }

    const cleanLocation = {
      roomNo: location?.roomNo || '',
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

    const cleanAffiliate = (affiliateOrganization && mongoose.Types.ObjectId.isValid(affiliateOrganization))
      ? affiliateOrganization
      : null;

    const doctorDetails = isDoctor ? {
      certificateNo: certificateNo || `MCI-${Date.now()}`,
      certificateDoc: certificateDoc || 'https://example.com/doc-cert.pdf',
      affiliateOrganization: cleanAffiliate,
      affiliateOrganizationApprovalStatus: 'pending',
      speciality: speciality || 'General Medicine',
      managerApprovalStatus: 'pending'
    } : null;

    let userProfile = await User.findOne({ accountId: account._id });
    if (userProfile) {
      userProfile.name = name || userProfile.name || 'User Profile';
      userProfile.isDoctor = Boolean(isDoctor);
      userProfile.location = cleanLocation;
      userProfile.coordinates = cleanCoords;
      userProfile.bloodGroup = bloodGroup || userProfile.bloodGroup || 'A+';
      if (isDoctor) userProfile.doctorDetails = doctorDetails;
    } else {
      userProfile = new User({
        accountId: account._id,
        name: name || (email ? email.split('@')[0] : 'User Profile'),
        isDoctor: Boolean(isDoctor),
        location: cleanLocation,
        coordinates: cleanCoords,
        bloodGroup: bloodGroup || 'A+',
        doctorDetails
      });
    }

    await userProfile.save();

    account.entityId = userProfile._id;
    account.role = isDoctor ? 'doctor' : 'patient';
    account.entityModel = 'User';
    await account.save();

    const updatedToken = request.server.jwt.sign({
      accountId: account._id,
      entityId: account.entityId,
      entityModel: account.entityModel,
      role: account.role
    });

    reply.setCookie('token', updatedToken, COOKIE_OPTIONS);

    return reply.send({
      success: true,
      message: 'User profile completed successfully.',
      token: updatedToken,
      userProfile
    });
  } catch (err) {
    console.error('completeUserProfile error:', err);
    return reply.code(500).send({ error: 'Failed to complete user profile.', details: err.message });
  }
};

// 3. Get Current User Profile & Identity (Auto-Repair Missing Profiles)
exports.getUserMe = async (request, reply) => {
  try {
    const { accountId } = request.user || {};

    if (!accountId) {
      return reply.code(401).send({ error: 'Authentication required.' });
    }

    const account = await Account.findById(accountId).select('-password');
    if (!account) {
      return reply.code(404).send({ error: 'Account not found.' });
    }

    let userProfile = null;
    try {
      userProfile = await User.findOne({ accountId: account._id })
        .populate({
          path: 'managedProfiles',
          select: 'name isDoctor bloodGroup location doctorDetails'
        })
        .populate({
          path: 'doctorDetails.affiliateOrganization',
          select: 'name facilityType location contactNumber'
        });
    } catch (popErr) {
      userProfile = await User.findOne({ accountId: account._id });
    }

    // Auto-repair missing profile
    if (!userProfile) {
      userProfile = new User({
        accountId: account._id,
        name: account.email ? account.email.split('@')[0] : 'User Profile',
        isDoctor: account.role === 'doctor',
        location: { roomNo: '', floorNo: 0, landmark: '', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
        coordinates: [77.2090, 28.6139],
        bloodGroup: 'A+'
      });
      await userProfile.save();
      account.entityId = userProfile._id;
      await account.save();
    }

    return reply.send({
      success: true,
      account,
      userProfile
    });
  } catch (err) {
    console.error('getUserMe error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve user profile.', details: err.message });
  }
};

// 4. Request Doctor-Organization Affiliation
exports.requestAffiliation = async (request, reply) => {
  try {
    const { entityId, accountId } = request.user || {};
    const { organizationId } = request.body || {};

    if (!organizationId) {
      return reply.code(400).send({ error: 'Organization ID is required.' });
    }

    let doctor = null;
    if (entityId) doctor = await User.findById(entityId);
    if (!doctor && accountId) doctor = await User.findOne({ accountId });

    if (!doctor || !doctor.isDoctor) {
      return reply.code(403).send({ error: 'Only doctors can request organization affiliation.' });
    }

    const org = await Organization.findById(organizationId);
    if (!org) {
      return reply.code(404).send({ error: 'Organization not found.' });
    }

    doctor.doctorDetails.affiliateOrganization = org._id;
    doctor.doctorDetails.affiliateOrganizationApprovalStatus = 'pending';
    await doctor.save();

    await Organization.findByIdAndUpdate(org._id, {
      $addToSet: { doctors: doctor._id }
    });

    return reply.send({
      success: true,
      message: `Affiliation request sent to ${org.name}. Waiting for hospital/clinic approval.`,
      doctor
    });
  } catch (err) {
    console.error('requestAffiliation error:', err);
    return reply.code(500).send({ error: 'Affiliation request failed.', details: err.message });
  }
};

// 5. Update User Profile
exports.getUserProfileById = async (request, reply) => {
  try {
    const { targetUserId } = request.params;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return reply.code(400).send({ error: 'Invalid user profile ID.' });
    }

    const userProfile = await User.findById(targetUserId)
      .select('name isDoctor bloodGroup location coordinates doctorDetails');

    if (!userProfile) {
      return reply.code(404).send({ error: 'User profile not found.' });
    }

    return reply.send({
      success: true,
      userProfile
    });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to fetch user profile.', details: err.message });
  }
};

exports.updateUserProfile = async (request, reply) => {
  try {
    const { targetUserId } = request.params;
    const { accountId, entityId } = request.user || {};

    let userProfile = null;
    if (entityId) userProfile = await User.findById(entityId);
    if (!userProfile && accountId) userProfile = await User.findOne({ accountId });

    if (!userProfile) {
      return reply.code(404).send({ error: 'User profile not found.' });
    }

    const allowedUpdates = ['name', 'bloodGroup', 'location', 'coordinates', 'doctorDetails'];
    Object.keys(request.body).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        userProfile[key] = request.body[key];
      }
    });

    await userProfile.save();

    return reply.send({
      success: true,
      message: 'Profile updated successfully.',
      userProfile
    });
  } catch (err) {
    return reply.code(500).send({ error: 'Profile update failed.', details: err.message });
  }
};

// 6. Delete User Profile & Account
exports.deleteUserProfile = async (request, reply) => {
  try {
    const { targetUserId } = request.params;
    const { accountId, entityId } = request.user || {};

    let userProfile = null;
    if (entityId) userProfile = await User.findById(entityId);
    if (!userProfile && accountId) userProfile = await User.findOne({ accountId });

    if (!userProfile) {
      return reply.code(404).send({ error: 'User profile not found.' });
    }

    await Account.findByIdAndDelete(userProfile.accountId);
    await User.findByIdAndDelete(userProfile._id);

    reply.clearCookie('token', { path: '/' });

    return reply.send({ success: true, message: 'User profile and account deleted.' });
  } catch (err) {
    console.error('deleteUserProfile error:', err);
    return reply.code(500).send({ error: 'Failed to delete user profile.', details: err.message });
  }
};

// 7. Search User By Email
exports.searchUserByEmail = async (request, reply) => {
  try {
    const { email } = request.query;
    if (!email) return reply.code(400).send({ error: 'Email parameter required.' });

    const account = await Account.findOne({ email: email.toLowerCase().trim() });
    if (!account) return reply.code(404).send({ error: 'No user found with this email.' });

    const userProfile = await User.findOne({ accountId: account._id }).select('name isDoctor bloodGroup location');
    return reply.send({ success: true, user: userProfile, email: account.email });
  } catch (err) {
    return reply.code(500).send({ error: 'Search failed.', details: err.message });
  }
};

// Managed Profile Stubs
exports.sendManagedProfileRequest = async (request, reply) => {
  return reply.send({ success: true, message: 'Request sent.' });
};

exports.respondManagedProfileRequest = async (request, reply) => {
  return reply.send({ success: true, message: 'Request updated.' });
};

exports.createSubAccountPatient = async (request, reply) => {
  return reply.send({ success: true, message: 'Sub-account created.' });
};
