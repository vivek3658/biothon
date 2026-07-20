const mongoose = require('mongoose');
const Account = require('../models/Account');
const Organization = require('../models/Organization');
const User = require('../models/User');

// Search & List Organizations (Returns all or filtered by query)
exports.searchOrganizations = async (request, reply) => {
  try {
    const query = request.query.query || '';
    const filter = {};
    if (query.trim()) {
      filter.$or = [
        { name: { $regex: query.trim(), $options: 'i' } },
        { 'location.city': { $regex: query.trim(), $options: 'i' } },
        { facilityType: { $regex: query.trim(), $options: 'i' } }
      ];
    }

    const orgs = await Organization.find(filter)
      .select('name facilityType location workingDays contactNumber verificationStatus')
      .limit(50)
      .lean();

    return reply.send({ success: true, organizations: orgs });
  } catch (err) {
    return reply.code(500).send({ error: 'Search failed.', details: err.message });
  }
};

// Get Pending & Affiliated Doctors for Organization
exports.getPendingDoctors = async (request, reply) => {
  try {
    const { entityId, accountId } = request.user || {};

    let org = null;
    if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
      org = await Organization.findById(entityId);
    }
    if (!org && accountId) org = await Organization.findOne({ accountId });

    if (!org) {
      return reply.code(404).send({ error: 'Organization identity not found.' });
    }

    const doctors = await User.find({
      $or: [
        { 'doctorDetails.affiliateOrganization': org._id },
        { 'doctorDetails.affiliateOrganization': org.accountId },
        { _id: { $in: org.doctors || [] } }
      ]
    })
      .populate({
        path: 'accountId',
        select: 'email'
      })
      .select('name bloodGroup doctorDetails location isDoctor')
      .lean();

    const normalizedDoctors = doctors.map((doctor) => ({
      ...doctor,
      email: doctor.accountId?.email || ''
    }));

    return reply.send({ success: true, doctors: normalizedDoctors, orgId: org._id });
  } catch (err) {
    console.error('getPendingDoctors error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve doctors.', details: err.message });
  }
};

// Approve Doctor Affiliation Request
exports.approveDoctor = async (request, reply) => {
  try {
    const { entityId, accountId } = request.user || {};
    const { doctorId } = request.params || {};

    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      return reply.code(400).send({ error: 'Invalid Doctor ID parameter.' });
    }

    let org = null;
    if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
      org = await Organization.findById(entityId);
    }
    if (!org && accountId) org = await Organization.findOne({ accountId });

    const doctor = await User.findById(doctorId);
    if (!doctor) {
      return reply.code(404).send({ error: 'Doctor profile not found.' });
    }

    if (!doctor.doctorDetails) {
      doctor.doctorDetails = {};
    }

    doctor.doctorDetails.affiliateOrganizationApprovalStatus = 'approved';
    if (org) {
      doctor.doctorDetails.affiliateOrganization = org._id;
    }
    doctor.isDoctor = true;
    await doctor.save();

    if (org) {
      await Organization.findByIdAndUpdate(org._id, {
        $addToSet: { doctors: doctor._id }
      });
    }

    return reply.send({
      success: true,
      message: `Doctor ${doctor.name} affiliated and approved successfully!`,
      doctor
    });
  } catch (err) {
    console.error('approveDoctor error:', err);
    return reply.code(500).send({ error: 'Approval failed.', details: err.message });
  }
};

// Reject Doctor Affiliation Request
exports.rejectDoctor = async (request, reply) => {
  try {
    const { doctorId } = request.params || {};

    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      return reply.code(400).send({ error: 'Invalid Doctor ID parameter.' });
    }

    const doctor = await User.findById(doctorId);
    if (!doctor) {
      return reply.code(404).send({ error: 'Doctor profile not found.' });
    }

    if (!doctor.doctorDetails) {
      doctor.doctorDetails = {};
    }

    doctor.doctorDetails.affiliateOrganizationApprovalStatus = 'rejected';
    await doctor.save();

    return reply.send({
      success: true,
      message: `Doctor ${doctor.name} affiliation request rejected.`,
      doctor
    });
  } catch (err) {
    console.error('rejectDoctor error:', err);
    return reply.code(500).send({ error: 'Rejection failed.', details: err.message });
  }
};

// Update Organization Profile
exports.updateOrgProfile = async (request, reply) => {
  const { targetOrgId } = request.params;
  const { entityId, role } = request.user;

  const isSelf = entityId && entityId.toString() === targetOrgId;
  const isAdmin = role === 'admin';

  if (!isSelf && !isAdmin) {
    return reply.code(403).send({ error: 'Forbidden: You do not have permission to modify this organization.' });
  }

  const allowedUpdates = [
    'name', 'contactNumber', 'location', 'coordinates',
    'workingDays', 'specialities', 'organizationCertificateUrl',
    'organizationCertificateNo', 'facilityType'
  ];

  const updateFields = {};
  Object.keys(request.body).forEach((key) => {
    if (allowedUpdates.includes(key)) {
      updateFields[key] = request.body[key];
    }
  });

  const updatedOrg = await Organization.findByIdAndUpdate(
    targetOrgId,
    { $set: updateFields },
    { new: true, runValidators: true }
  );

  if (!updatedOrg) {
    return reply.code(404).send({ error: 'Organization profile not found.' });
  }

  return reply.send({
    success: true,
    message: 'Organization profile updated successfully.',
    organization: updatedOrg
  });
};

// Delete Organization Account & Profile
exports.deleteOrgAccount = async (request, reply) => {
  const { targetOrgId } = request.params;
  const { entityId, role } = request.user;

  const isSelf = entityId && entityId.toString() === targetOrgId;
  const isAdmin = role === 'admin';

  if (!isSelf && !isAdmin) {
    return reply.code(403).send({ error: 'Forbidden: You cannot delete this organization account.' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const organization = await Organization.findById(targetOrgId).session(session);
    if (!organization) {
      await session.abortTransaction();
      session.endSession();
      return reply.code(404).send({ error: 'Organization not found.' });
    }

    await Account.findByIdAndDelete(organization.accountId).session(session);
    await Organization.findByIdAndDelete(targetOrgId).session(session);

    await session.commitTransaction();
    session.endSession();

    if (isSelf) {
      reply.clearCookie('token', { path: '/' });
    }

    return reply.send({
      success: true,
      message: 'Organization account and profile purged successfully.'
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return reply.code(500).send({ error: 'Deletion failed.', details: err.message });
  }
};
