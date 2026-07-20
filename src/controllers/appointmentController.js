const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const AppointmentSlot = require('../models/AppointmentSlot');
const Organization = require('../models/Organization');
const User = require('../models/User');

const resolveUserProfile = async ({ accountId, entityId }) => {
  if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
    const user = await User.findById(entityId);
    if (user) return user;
  }
  if (accountId) return User.findOne({ accountId });
  return null;
};

const resolveOrganization = async ({ accountId, entityId }) => {
  if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
    const organization = await Organization.findById(entityId);
    if (organization) return organization;
  }
  if (accountId) return Organization.findOne({ accountId });
  return null;
};

exports.createSlot = async (request, reply) => {
  try {
    const organization = await resolveOrganization(request.user || {});
    if (!organization) return reply.code(403).send({ error: 'Organization identity required.' });

    const { doctorId, title, description, slotDate, startTime, endTime, maxBookings, consultationMode, fee } = request.body || {};
    if (!slotDate || !startTime || !endTime) {
      return reply.code(400).send({ error: 'slotDate, startTime, and endTime are required.' });
    }

    const slot = await AppointmentSlot.create({
      organizationId: organization._id,
      doctorId: doctorId && mongoose.Types.ObjectId.isValid(doctorId) ? doctorId : null,
      title: title || 'Consultation Slot',
      description: description || '',
      slotDate,
      startTime,
      endTime,
      maxBookings: parseInt(maxBookings, 10) || 1,
      consultationMode: consultationMode || 'in_person',
      fee: parseFloat(fee) || 0
    });

    return reply.code(201).send({ success: true, slot });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to create appointment slot.', details: err.message });
  }
};

exports.getSlots = async (request, reply) => {
  try {
    const { organizationId, doctorId, status = 'open' } = request.query || {};
    const filter = {};
    if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) filter.organizationId = organizationId;
    if (doctorId && mongoose.Types.ObjectId.isValid(doctorId)) filter.doctorId = doctorId;
    if (status !== 'all') filter.status = status;

    const slots = await AppointmentSlot.find(filter)
      .populate('organizationId', 'name facilityType location')
      .populate('doctorId', 'name doctorDetails')
      .sort({ slotDate: 1, startTime: 1 })
      .lean();

    return reply.send({ success: true, slots });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to fetch appointment slots.', details: err.message });
  }
};

exports.bookAppointment = async (request, reply) => {
  try {
    const patient = await resolveUserProfile(request.user || {});
    if (!patient) return reply.code(403).send({ error: 'Patient identity required.' });

    const { slotId, reason } = request.body || {};
    if (!slotId || !mongoose.Types.ObjectId.isValid(slotId)) {
      return reply.code(400).send({ error: 'Valid slotId is required.' });
    }

    const slot = await AppointmentSlot.findById(slotId);
    if (!slot) return reply.code(404).send({ error: 'Appointment slot not found.' });
    if (slot.status !== 'open') return reply.code(400).send({ error: 'This appointment slot is not open.' });
    if (slot.bookedCount >= slot.maxBookings) {
      slot.status = 'full';
      await slot.save();
      return reply.code(400).send({ error: 'This appointment slot is already full.' });
    }

    const existing = await Appointment.findOne({ slotId: slot._id, patientId: patient._id, status: { $in: ['requested', 'appointed'] } });
    if (existing) return reply.code(409).send({ error: 'You have already booked this slot.' });

    const appointment = await Appointment.create({
      slotId: slot._id,
      organizationId: slot.organizationId,
      doctorId: slot.doctorId,
      patientId: patient._id,
      reason: reason || '',
      appointmentDate: slot.slotDate,
      appointmentTime: `${slot.startTime} - ${slot.endTime}`
    });

    slot.bookedCount += 1;
    if (slot.bookedCount >= slot.maxBookings) slot.status = 'full';
    await slot.save();

    return reply.code(201).send({ success: true, appointment });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to book appointment.', details: err.message });
  }
};

exports.getAppointments = async (request, reply) => {
  try {
    const { role } = request.user || {};
    const user = await resolveUserProfile(request.user || {});
    const organization = await resolveOrganization(request.user || {});
    const filter = {};

    if (organization) filter.organizationId = organization._id;
    else if (user?.isDoctor) filter.doctorId = user._id;
    else if (user) filter.patientId = user._id;
    else if (role !== 'admin') return reply.code(403).send({ error: 'No appointment identity found.' });

    const appointments = await Appointment.find(filter)
      .populate('organizationId', 'name facilityType location contactNumber')
      .populate('doctorId', 'name doctorDetails')
      .populate('patientId', 'name bloodGroup location')
      .populate('slotId', 'slotDate startTime endTime consultationMode fee')
      .sort({ createdAt: -1 })
      .lean();

    return reply.send({ success: true, appointments });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to fetch appointments.', details: err.message });
  }
};

exports.updateAppointmentStatus = async (request, reply) => {
  try {
    const { appointmentId } = request.params || {};
    const { status, rejectionReason } = request.body || {};
    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) return reply.code(400).send({ error: 'Invalid appointmentId.' });
    if (!['appointed', 'rejected', 'cancelled', 'completed'].includes(status)) return reply.code(400).send({ error: 'Invalid appointment status.' });

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) return reply.code(404).send({ error: 'Appointment not found.' });

    const organization = await resolveOrganization(request.user || {});
    const doctor = await resolveUserProfile(request.user || {});
    const isAllowed = (organization && organization._id.toString() === appointment.organizationId.toString()) || (doctor?.isDoctor && appointment.doctorId && appointment.doctorId.toString() === doctor._id.toString()) || request.user?.role === 'admin';
    if (!isAllowed) return reply.code(403).send({ error: 'You do not have permission to modify this appointment.' });

    appointment.status = status;
    appointment.rejectionReason = status === 'rejected' ? (rejectionReason || 'Rejected by provider.') : '';
    await appointment.save();

    return reply.send({ success: true, appointment });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to update appointment.', details: err.message });
  }
};
