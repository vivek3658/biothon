const mongoose = require('mongoose');
const Account = require('../models/Account');
const Organization = require('../models/Organization');

// Update Organization Profile
exports.updateOrgProfile = async (request, reply) => {
  const { targetOrgId } = request.params;
  const { accountId, entityId, role } = request.user; // From JWT payload

  // Access Control: Must be the organization itself OR an admin
  const isSelf = entityId && entityId.toString() === targetOrgId;
  const isAdmin = role === 'admin';

  if (!isSelf && !isAdmin) {
    return reply.code(403).send({ error: 'Forbidden: You do not have permission to modify this organization.' });
  }

  const allowedUpdates = [
    'name', 'contactNumber', 'location', 'coordinates',
    'workingDays', 'specialities', 'organizationCertificateUrl'
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

  // Access Control: Self or Admin
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

    // Delete associated parent Account and Organization profile
    await Account.findByIdAndDelete(organization.accountId).session(session);
    await Organization.findByIdAndDelete(targetOrgId).session(session);

    await session.commitTransaction();
    session.endSession();

    // Clear cookie if self-deleting
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