const bcrypt = require('bcryptjs');
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

    if (account.entityModel !== 'User') {
      return reply.code(403).send({ error: 'This account is not registered as a patient or doctor.' });
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

exports.logout = async (request, reply) => {
  reply.clearCookie('token', { path: '/' });
  return reply.send({ success: true, message: 'Logged out successfully.' });
};

// 2. Complete User or Organization Profile
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

    const account = await Account.findById(accountId);
    if (!account) {
      return reply.code(404).send({ error: 'Target account record not found.' });
    }

    const isOrgAccount = account.entityModel === 'Organization' || 
      ['hospital', 'clinic', 'laboratory', 'pharmacy', 'other'].includes(account.role) ||
      Boolean(request.body?.facilityType);

    if (isOrgAccount) {
      const {
        name,
        facilityType,
        contactNumber,
        location,
        coordinates,
        organizationCertificateNo,
        organizationCertificateUrl
      } = request.body || {};

      const cleanLoc = {
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

      const targetFacilityType = facilityType || (['hospital', 'clinic', 'laboratory', 'pharmacy'].includes(account.role) ? account.role : 'pharmacy');

      let orgProfile = await Organization.findOne({ accountId: account._id });
      if (orgProfile) {
        orgProfile.name = name || orgProfile.name || 'Healthcare Facility';
        orgProfile.facilityType = targetFacilityType;
        orgProfile.contactNumber = contactNumber || orgProfile.contactNumber || '+91 9876543210';
        orgProfile.location = cleanLoc;
        orgProfile.coordinates = cleanCoords;
        orgProfile.verificationStatus = 'approved';
      } else {
        orgProfile = new Organization({
          accountId: account._id,
          name: name || (account.email ? account.email.split('@')[0] : 'Healthcare Facility'),
          facilityType: targetFacilityType,
          contactNumber: contactNumber || '+91 9876543210',
          location: cleanLoc,
          coordinates: cleanCoords,
          verificationStatus: 'approved'
        });
      }
      await orgProfile.save();

      account.entityId = orgProfile._id;
      account.entityModel = 'Organization';
      account.role = targetFacilityType;
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
        message: 'Organization profile completed successfully.',
        token: updatedToken,
        userProfile: orgProfile,
        organization: orgProfile
      });
    }

    // Otherwise Patient / Doctor User Profile
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

    if (account.entityModel !== 'User') {
      return reply.code(403).send({ error: 'Account is registered as an Organization, not a User.' });
    }

    let userProfile = null;
    try {
      userProfile = await User.findOne({ accountId: account._id })
        .populate({
          path: 'managedProfiles',
          select: 'name isDoctor bloodGroup location doctorDetails'
        })
        .populate({
          path: 'accountId',
          select: 'email role'
        })
        .populate({
          path: 'doctorDetails.affiliateOrganization',
          select: 'name facilityType location contactNumber verificationStatus'
        })
        .populate({
          path: 'doctorDetails.affiliatedOrganizations',
          select: 'name facilityType location contactNumber verificationStatus'
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

// 8. Managed Profiles & Family Member Workflows
exports.sendManagedProfileRequest = async (request, reply) => {
  try {
    const { entityId, accountId } = request.user || {};
    const { email, name, bloodGroup, location, houseNo, roomNo, floorNo, landmark, city, state, pincode } = request.body || {};

    if (!email || !email.trim()) {
      return reply.code(400).send({ error: 'Family member email is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    let currentUser = null;
    if (entityId) currentUser = await User.findById(entityId);
    if (!currentUser && accountId) currentUser = await User.findOne({ accountId });

    if (!currentUser) {
      return reply.code(404).send({ error: 'Current user profile not found.' });
    }

    const currentAccount = await Account.findById(currentUser.accountId);

    let targetAccount = await Account.findOne({ email: cleanEmail });
    let targetUser = null;

    const cleanLoc = {
      houseNo: houseNo || location?.houseNo || '',
      roomNo: roomNo || location?.roomNo || '',
      floorNo: parseInt(floorNo || location?.floorNo, 10) || 0,
      landmark: landmark || location?.landmark || '',
      city: city || location?.city?.trim() || 'New Delhi',
      state: state || location?.state?.trim() || 'Delhi',
      pincode: (pincode || location?.pincode) ? (pincode || location?.pincode).toString().trim() : '110001'
    };

    if (targetAccount) {
      targetUser = await User.findOne({ accountId: targetAccount._id });
      if (!targetUser) {
        targetUser = new User({
          accountId: targetAccount._id,
          name: name || cleanEmail.split('@')[0],
          bloodGroup: bloodGroup || 'A+',
          location: cleanLoc
        });
        await targetUser.save();
      }

      if (!currentUser.managedProfiles.includes(targetUser._id)) {
        currentUser.managedProfiles.push(targetUser._id);
        await currentUser.save();
      }

      targetUser.pendingProfileRequests.push({
        fromUserId: currentUser._id,
        fromEmail: currentAccount?.email || '',
        status: 'accepted'
      });
      await targetUser.save();

      return reply.send({
        success: true,
        message: `Existing patient (${cleanEmail}) linked to your family profiles.`,
        targetUser
      });
    } else {
      const randomPassword = await bcrypt.hash(`sub_${Date.now()}_${Math.random()}`, 10);
      targetAccount = new Account({
        email: cleanEmail,
        password: randomPassword,
        role: 'patient',
        entityModel: 'User'
      });
      await targetAccount.save();

      targetUser = new User({
        accountId: targetAccount._id,
        name: name || cleanEmail.split('@')[0],
        bloodGroup: bloodGroup || 'A+',
        location: cleanLoc
      });
      await targetUser.save();

      targetAccount.entityId = targetUser._id;
      await targetAccount.save();

      currentUser.managedProfiles.push(targetUser._id);
      await currentUser.save();

      return reply.send({
        success: true,
        message: `New family profile created for ${name || cleanEmail} and auto-linked!`,
        targetUser
      });
    }
  } catch (err) {
    console.error('sendManagedProfileRequest error:', err);
    return reply.code(500).send({ error: 'Failed to manage family profile.', details: err.message });
  }
};

exports.removeManagedProfile = async (request, reply) => {
  try {
    const { entityId, accountId } = request.user || {};
    const { targetUserId } = request.params || {};

    let currentUser = null;
    if (entityId) currentUser = await User.findById(entityId);
    if (!currentUser && accountId) currentUser = await User.findOne({ accountId });

    if (!currentUser) {
      return reply.code(404).send({ error: 'Current user profile not found.' });
    }

    currentUser.managedProfiles = currentUser.managedProfiles.filter(
      id => id.toString() !== targetUserId.toString()
    );
    await currentUser.save();

    return reply.send({
      success: true,
      message: 'Family member profile unlinked successfully.'
    });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to remove managed profile.', details: err.message });
  }
};

exports.respondManagedProfileRequest = async (request, reply) => {
  try {
    const { entityId, accountId } = request.user || {};
    const { requestId } = request.params || {};
    const { status } = request.body || {};

    let currentUser = null;
    if (entityId) currentUser = await User.findById(entityId);
    if (!currentUser && accountId) currentUser = await User.findOne({ accountId });

    if (!currentUser) {
      return reply.code(404).send({ error: 'Current user profile not found.' });
    }

    const reqItem = currentUser.pendingProfileRequests.id(requestId);
    if (!reqItem) {
      return reply.code(404).send({ error: 'Request item not found.' });
    }

    reqItem.status = status || 'accepted';

    if (status === 'accepted' && reqItem.fromUserId) {
      const fromUser = await User.findById(reqItem.fromUserId);
      if (fromUser && !fromUser.managedProfiles.includes(currentUser._id)) {
        fromUser.managedProfiles.push(currentUser._id);
        await fromUser.save();
      }
    }

    await currentUser.save();

    return reply.send({
      success: true,
      message: `Profile request ${status || 'accepted'}.`
    });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to respond to request.', details: err.message });
  }
};

exports.createSubAccountPatient = exports.sendManagedProfileRequest;
