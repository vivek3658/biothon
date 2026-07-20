const Organization = require('../models/Organization');
const User = require('../models/User');

exports.getPendingOrganizations = async (request, reply) => {
  try {
    const pendingOrgs = await Organization.find({ 
      verificationStatus: { $in: ['pending', 'pending_approval'] } 
    }).populate('accountId', '-password').sort({ createdAt: -1 });

    return reply.send({
      success: true,
      count: pendingOrgs.length,
      organizations: pendingOrgs
    });
  } catch (err) {
    return reply.code(500).send({ 
      error: 'Failed to retrieve pending organizations.', 
      details: err.message 
    });
  }
};

exports.getAllOrganizations = async (request, reply) => {
  try {
    const { status } = request.query || {};
    const filter = {};
    if (status && status !== 'all') {
      filter.verificationStatus = status;
    }
    const orgs = await Organization.find(filter)
      .populate('accountId', '-password')
      .sort({ createdAt: -1 });

    return reply.send({
      success: true,
      count: orgs.length,
      organizations: orgs
    });
  } catch (err) {
    return reply.code(500).send({
      error: 'Failed to retrieve organizations.',
      details: err.message
    });
  }
};

exports.verifyOrganization = async (request, reply) => {
  try {
    const { orgId } = request.params;
    const { action, reason } = request.body;

    if (!['approve', 'reject'].includes(action)) {
      return reply.code(400).send({ error: 'Invalid action. Must be "approve" or "reject".' });
    }

    const organization = await Organization.findById(orgId);

    if (!organization) {
      return reply.code(404).send({ error: 'Target organization profile not found.' });
    }

    if (action === 'approve') {
      organization.verificationStatus = 'approved';
      organization.rejectionReason = '';
      await organization.save();

      return reply.send({
        success: true,
        message: 'Organization approved successfully.',
        verificationStatus: organization.verificationStatus
      });
    }

    if (action === 'reject') {
      organization.verificationStatus = 'rejected';
      organization.rejectionReason = reason || 'Verification requirements not met.';
      await organization.save();

      return reply.send({
        success: true,
        message: 'Organization application rejected.',
        verificationStatus: organization.verificationStatus,
        reason: organization.rejectionReason
      });
    }
  } catch (err) {
    return reply.code(500).send({ 
      error: 'Verification processing failed.', 
      details: err.message 
    });
  }
};

// Manager Doctor Verification Controllers
exports.getPendingDoctors = async (request, reply) => {
  try {
    const pendingDoctors = await User.find({
      isDoctor: true,
      'doctorDetails.managerApprovalStatus': 'pending'
    })
    .populate('accountId', 'email role')
    .populate('doctorDetails.affiliateOrganization', 'name facilityType location');

    const doctors = pendingDoctors.map((doctor) => ({
      ...doctor.toObject(),
      email: doctor.accountId?.email || ''
    }));

    return reply.send({
      success: true,
      count: doctors.length,
      doctors
    });
  } catch (err) {
    return reply.code(500).send({
      error: 'Failed to retrieve pending doctor verifications.',
      details: err.message
    });
  }
};

exports.verifyDoctor = async (request, reply) => {
  try {
    const { doctorId } = request.params;
    const { action, reason } = request.body;

    if (!['approve', 'reject'].includes(action)) {
      return reply.code(400).send({ error: 'Invalid action. Must be "approve" or "reject".' });
    }

    const doctorUser = await User.findById(doctorId);
    if (!doctorUser || !doctorUser.isDoctor) {
      return reply.code(404).send({ error: 'Target doctor profile not found.' });
    }

    if (action === 'approve') {
      doctorUser.doctorDetails.managerApprovalStatus = 'approved';
      await doctorUser.save();

      return reply.send({
        success: true,
        message: 'Doctor verified successfully by manager.',
        managerApprovalStatus: doctorUser.doctorDetails.managerApprovalStatus
      });
    }

    if (action === 'reject') {
      doctorUser.doctorDetails.managerApprovalStatus = 'rejected';
      await doctorUser.save();

      return reply.send({
        success: true,
        message: 'Doctor verification rejected.',
        managerApprovalStatus: doctorUser.doctorDetails.managerApprovalStatus
      });
    }
  } catch (err) {
    return reply.code(500).send({
      error: 'Doctor verification processing failed.',
      details: err.message
    });
  }
};
