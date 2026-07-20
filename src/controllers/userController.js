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

    // Check if account exists
    const account = await Account.findOne({ email: cleanEmail });
    if (!account) {
      return reply.code(401).send({ error: 'No user account found with this email.' });
    }

    if (account.entityModel !== 'User') {
      return reply.code(400).send({ error: `This account is registered under ${account.entityModel} Portal. Please use the ${account.entityModel} tab.` });
    }

    const isMatch = await bcrypt.compare(password, account.password);
    if (!isMatch) {
      return reply.code(401).send({ error: 'Invalid email or password.' });
    }

    // Auto-repair/auto-provision User profile if missing
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
      entityModel: account.entityModel,
      role: account.role
    });

    reply.setCookie('token', token, COOKIE_OPTIONS);

    return reply.send({
      success: true,
      message: 'User login successful.',
      token,
      accountId: account._id,
      entityId: userProfile._id,
      role: account.role
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
      const foundAcc = await Account.findOne({ email: email.toLowerCase().trim(), entityModel: 'User' });
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
    } else if (coordinates?.coordinates && Array.isArray(coordinates.coordinates)) {
      cleanCoords = [parseFloat(coordinates.coordinates[0]) || 77.2090, parseFloat(coordinates.coordinates[1]) || 28.6139];
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
      console.warn('Populate failed in getUserMe, falling back to unpopulated profile:', popErr.message);
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

// 4. Update User Profile
exports.updateUserProfile = async (request, reply) => {
  try {
    const { targetUserId } = request.params;
    const { accountId, entityId } = request.user || {};

    let userProfile = null;
    if (entityId) {
      userProfile = await User.findById(entityId);
    }
    if (!userProfile && accountId) {
      userProfile = await User.findOne({ accountId });
    }
    if (!userProfile && targetUserId) {
      userProfile = await User.findById(targetUserId);
    }

    if (!userProfile) {
      return reply.code(404).send({ error: 'User profile not found.' });
    }

    const { name, bloodGroup, location, coordinates, doctorDetails } = request.body || {};

    if (name) userProfile.name = name;
    if (bloodGroup) userProfile.bloodGroup = bloodGroup;

    if (location) {
      userProfile.location = {
        roomNo: location.roomNo !== undefined ? location.roomNo : (userProfile.location?.roomNo || ''),
        floorNo: location.floorNo !== undefined ? (parseInt(location.floorNo, 10) || 0) : (userProfile.location?.floorNo || 0),
        landmark: location.landmark !== undefined ? location.landmark : (userProfile.location?.landmark || ''),
        city: location.city ? location.city.trim() : (userProfile.location?.city || 'New Delhi'),
        state: location.state ? location.state.trim() : (userProfile.location?.state || 'Delhi'),
        pincode: (location.pincode && location.pincode.toString().trim()) ? location.pincode.toString().trim() : (userProfile.location?.pincode || '110001')
      };
    }

    if (coordinates) {
      if (Array.isArray(coordinates) && coordinates.length === 2) {
        userProfile.coordinates = [parseFloat(coordinates[0]) || 77.2090, parseFloat(coordinates[1]) || 28.6139];
      } else if (coordinates?.coordinates && Array.isArray(coordinates.coordinates)) {
        userProfile.coordinates = [parseFloat(coordinates.coordinates[0]) || 77.2090, parseFloat(coordinates.coordinates[1]) || 28.6139];
      }
    }

    if (doctorDetails && userProfile.isDoctor) {
      const cleanAffiliate = (doctorDetails.affiliateOrganization && mongoose.Types.ObjectId.isValid(doctorDetails.affiliateOrganization))
        ? doctorDetails.affiliateOrganization
        : null;

      userProfile.doctorDetails = {
        ...userProfile.doctorDetails,
        ...doctorDetails,
        affiliateOrganization: cleanAffiliate
      };
    }

    await userProfile.save();

    return reply.send({
      success: true,
      message: 'User profile updated successfully.',
      userProfile
    });
  } catch (err) {
    console.error('updateUserProfile error:', err);
    return reply.code(500).send({ error: 'Failed to update user profile.', details: err.message });
  }
};

// 5. Delete User Profile & Account
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

// 6. Search User By Email (for family linking)
exports.searchUserByEmail = async (request, reply) => {
  try {
    const { email } = request.query;
    if (!email) {
      return reply.code(400).send({ error: 'Email parameter required.' });
    }

    const account = await Account.findOne({ email: email.toLowerCase().trim(), entityModel: 'User' });
    if (!account) {
      return reply.code(404).send({ error: 'No user found with specified email.' });
    }

    const userProfile = await User.findOne({ accountId: account._id }).select('name isDoctor bloodGroup location');

    return reply.send({
      success: true,
      user: {
        accountId: account._id,
        email: account.email,
        profile: userProfile
      }
    });
  } catch (err) {
    console.error('searchUserByEmail error:', err);
    return reply.code(500).send({ error: 'User search failed.', details: err.message });
  }
};

// 7. Send Managed Profile Request
exports.sendManagedProfileRequest = async (request, reply) => {
  try {
    const { targetEmail } = request.body || {};
    const { accountId } = request.user || {};

    const senderUser = await User.findOne({ accountId });
    if (!senderUser) {
      return reply.code(404).send({ error: 'Sender user profile not found.' });
    }

    const targetAccount = await Account.findOne({ email: targetEmail.toLowerCase().trim(), entityModel: 'User' });
    if (!targetAccount) {
      return reply.code(404).send({ error: 'Target user account not found.' });
    }

    const targetUser = await User.findOne({ accountId: targetAccount._id });
    if (!targetUser) {
      return reply.code(404).send({ error: 'Target user profile not found.' });
    }

    if (senderUser.managedProfiles.includes(targetUser._id)) {
      return reply.code(400).send({ error: 'Target user is already in your managed profiles.' });
    }

    targetUser.pendingProfileRequests.push({
      fromUserId: senderUser._id,
      fromEmail: request.user.email || 'sender@arogyax.com',
      status: 'pending'
    });

    await targetUser.save();

    return reply.send({
      success: true,
      message: 'Managed profile link request sent to target user.'
    });
  } catch (err) {
    console.error('sendManagedProfileRequest error:', err);
    return reply.code(500).send({ error: 'Request failed.', details: err.message });
  }
};

// 8. Respond to Managed Profile Request
exports.respondManagedProfileRequest = async (request, reply) => {
  try {
    const { requestId } = request.params;
    const { action } = request.body || {};
    const { accountId } = request.user || {};

    const userProfile = await User.findOne({ accountId });
    if (!userProfile) {
      return reply.code(404).send({ error: 'User profile not found.' });
    }

    const reqItem = userProfile.pendingProfileRequests.id(requestId);
    if (!reqItem) {
      return reply.code(404).send({ error: 'Request not found.' });
    }

    if (action === 'approve') {
      reqItem.status = 'approved';
      const senderUser = await User.findById(reqItem.fromUserId);
      if (senderUser && !senderUser.managedProfiles.includes(userProfile._id)) {
        senderUser.managedProfiles.push(userProfile._id);
        await senderUser.save();
      }
    } else {
      reqItem.status = 'rejected';
    }

    await userProfile.save();

    return reply.send({
      success: true,
      message: `Profile request ${action}d successfully.`
    });
  } catch (err) {
    console.error('respondManagedProfileRequest error:', err);
    return reply.code(500).send({ error: 'Response failed.', details: err.message });
  }
};

// 9. Create Sub-Account Patient (Auto-Attached to Creator)
exports.createSubAccountPatient = async (request, reply) => {
  try {
    const { accountId } = request.user || {};
    const { email, password, name, location, bloodGroup } = request.body || {};

    const parentUser = await User.findOne({ accountId });
    if (!parentUser) {
      return reply.code(404).send({ error: 'Parent user profile not found.' });
    }

    const existingAccount = await Account.findOne({ email: email.toLowerCase().trim() });
    if (existingAccount) {
      return reply.code(409).send({ error: 'Account with specified email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const subAccount = new Account({
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'patient',
      entityModel: 'User'
    });

    await subAccount.save();

    const cleanLocation = {
      roomNo: location?.roomNo || '',
      floorNo: parseInt(location?.floorNo, 10) || 0,
      landmark: location?.landmark || '',
      city: location?.city?.trim() || 'New Delhi',
      state: location?.state?.trim() || 'Delhi',
      pincode: (location?.pincode && location.pincode.toString().trim()) ? location.pincode.toString().trim() : '110001'
    };

    const subUser = new User({
      accountId: subAccount._id,
      name: name || 'Family Member',
      isDoctor: false,
      location: cleanLocation,
      coordinates: [77.2090, 28.6139],
      bloodGroup: bloodGroup || 'A+'
    });

    await subUser.save();

    subAccount.entityId = subUser._id;
    await subAccount.save();

    parentUser.managedProfiles.push(subUser._id);
    await parentUser.save();

    return reply.code(201).send({
      success: true,
      message: 'Family member sub-account created and auto-attached to your managed profiles.',
      subUser
    });
  } catch (err) {
    console.error('createSubAccountPatient error:', err);
    return reply.code(500).send({ error: 'Sub-account creation failed.', details: err.message });
  }
};
