const Account = require('../models/Account');
const Organization = require('../models/Organization');

exports.getPendingOrganizations = async (request, reply) => {
  try {
    const pendingOrgs = await Organization.find({ verificationStatus: 'pending_approval' })
      .populate('accountId', '-password');

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
      organization.rejectionReason = null;
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