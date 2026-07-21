const mongoose = require('mongoose');
const crypto = require('crypto');
const Appointment = require('../models/Appointment');
const AppointmentSlot = require('../models/AppointmentSlot');
const Organization = require('../models/Organization');
const User = require('../models/User');

const resolveUserProfile = async ({ accountId, entityId, entityModel }) => {
  if (entityModel && entityModel !== 'User') return null;
  if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
    const user = await User.findById(entityId);
    if (user) return user;
  }
  if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    let user = await User.findOne({ accountId });
    if (user) return user;
  }
  return null;
};

const resolveOrganization = async ({ accountId, entityId, entityModel }) => {
  if (entityModel && entityModel !== 'Organization') return null;
  if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
    const organization = await Organization.findById(entityId);
    if (organization) return organization;
  }
  if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    let organization = await Organization.findOne({ accountId });
    if (organization) return organization;
  }
  return null;
};

// 1. Create Single Slot
exports.createSlot = async (request, reply) => {
  try {
    const user = await resolveUserProfile(request.user || {});
    const organization = await resolveOrganization(request.user || {});
    const { role } = request.user || {};
    
    let targetOrgId = null;
    let targetDocId = null;

    if (organization) {
      targetOrgId = organization._id;
      if (request.body?.doctorId && mongoose.Types.ObjectId.isValid(request.body.doctorId)) {
        targetDocId = request.body.doctorId;
      }
    } else if (user || role === 'doctor' || role === 'practitioner') {
      if (user) {
        if (!user.isDoctor) {
          user.isDoctor = true;
          await user.save();
        }
        targetDocId = user._id;
        const maybeOrgId = user.doctorDetails?.affiliatedOrganizations?.[0] || user.doctorDetails?.affiliateOrganization || request.body?.organizationId;
        if (maybeOrgId && mongoose.Types.ObjectId.isValid(maybeOrgId)) {
          targetOrgId = maybeOrgId;
        }
      }
    } else {
      return reply.code(403).send({ error: 'Doctor or Organization identity required to publish consultation slots.' });
    }

    const { title, description, slotDate, startTime, endTime, maxBookings, consultationMode, fee } = request.body || {};
    if (!slotDate || !startTime || !endTime) {
      return reply.code(400).send({ error: 'slotDate, startTime, and endTime are required.' });
    }

    const slot = await AppointmentSlot.create({
      organizationId: targetOrgId,
      doctorId: targetDocId,
      title: title || 'Consultation Slot',
      description: description || '',
      slotDate,
      startTime,
      endTime,
      maxBookings: parseInt(maxBookings, 10) || 5,
      consultationMode: consultationMode || 'in_person',
      fee: parseFloat(fee) || 0
    });

    return reply.code(201).send({ success: true, slot });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to create appointment slot.', details: err.message });
  }
};

// 2. Generate Bulk Time Slots Engine
exports.generateSlots = async (request, reply) => {
  try {
    const user = await resolveUserProfile(request.user || {});
    const organization = await resolveOrganization(request.user || {});
    
    let targetOrgId = null;
    let targetDocId = null;

    if (organization) {
      targetOrgId = organization._id;
      if (request.body?.doctorId && mongoose.Types.ObjectId.isValid(request.body.doctorId)) {
        targetDocId = request.body.doctorId;
      }
    } else if (user) {
      targetDocId = user._id;
      const maybeOrgId = user.doctorDetails?.affiliatedOrganizations?.[0] || request.body?.organizationId;
      if (maybeOrgId && mongoose.Types.ObjectId.isValid(maybeOrgId)) {
        targetOrgId = maybeOrgId;
      }
    }

    const { slotDate, startHour = 9, endHour = 17, slotDurationMinutes = 30, maxBookings = 2, fee = 500 } = request.body || {};
    if (!slotDate) {
      return reply.code(400).send({ error: 'slotDate (YYYY-MM-DD) is required.' });
    }

    const createdSlots = [];
    let currentMin = parseInt(startHour, 10) * 60;
    const endMin = parseInt(endHour, 10) * 60;
    const duration = parseInt(slotDurationMinutes, 10) || 30;

    while (currentMin + duration <= endMin) {
      const startH = Math.floor(currentMin / 60).toString().padStart(2, '0');
      const startM = (currentMin % 60).toString().padStart(2, '0');
      const endH = Math.floor((currentMin + duration) / 60).toString().padStart(2, '0');
      const endM = ((currentMin + duration) % 60).toString().padStart(2, '0');

      createdSlots.push({
        organizationId: targetOrgId,
        doctorId: targetDocId,
        title: 'Consultation Slot',
        slotDate,
        startTime: `${startH}:${startM}`,
        endTime: `${endH}:${endM}`,
        maxBookings: parseInt(maxBookings, 10) || 2,
        bookedCount: 0,
        status: 'open',
        fee: parseFloat(fee) || 500
      });

      currentMin += duration;
    }

    const result = await AppointmentSlot.insertMany(createdSlots);
    return reply.code(201).send({ success: true, count: result.length, slots: result });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to generate appointment slots.', details: err.message });
  }
};

// 3. Get Slots
exports.getSlots = async (request, reply) => {
  try {
    const { organizationId, doctorId, status = 'open', date } = request.query || {};
    const filter = {};
    if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) filter.organizationId = organizationId;
    if (doctorId && mongoose.Types.ObjectId.isValid(doctorId)) filter.doctorId = doctorId;
    if (date) filter.slotDate = date;
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

// 4. Book Appointment & Generate QR Ticket
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
      return reply.code(400).send({ error: 'This appointment slot is full.' });
    }

    const existing = await Appointment.findOne({ slotId: slot._id, patientId: patient._id, status: { $in: ['requested', 'appointed', 'checked_in', 'waiting'] } });
    if (existing) return reply.code(409).send({ error: 'You have already booked this slot.' });

    // Calculate sequential token number for doctor/date
    const todayCount = await Appointment.countDocuments({
      doctorId: slot.doctorId,
      appointmentDate: slot.slotDate
    });

    const tokenNumber = todayCount + 1;
    const qrCodeToken = `AROGYAX-APT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const appointment = await Appointment.create({
      slotId: slot._id,
      organizationId: slot.organizationId,
      doctorId: slot.doctorId,
      patientId: patient._id,
      reason: reason || '',
      appointmentDate: slot.slotDate,
      appointmentTime: `${slot.startTime} - ${slot.endTime}`,
      tokenNumber,
      qrCodeToken,
      status: 'appointed'
    });

    slot.bookedCount += 1;
    if (slot.bookedCount >= slot.maxBookings) slot.status = 'full';
    await slot.save();

    return reply.code(201).send({ success: true, appointment });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to book appointment.', details: err.message });
  }
};

// 5. Scan QR & Check-In Patient
exports.checkInAppointment = async (request, reply) => {
  try {
    const { qrCodeToken, appointmentId } = request.body || {};
    let appointment = null;

    if (qrCodeToken) {
      appointment = await Appointment.findOne({ qrCodeToken });
    } else if (appointmentId && mongoose.Types.ObjectId.isValid(appointmentId)) {
      appointment = await Appointment.findById(appointmentId);
    }

    if (!appointment) {
      return reply.code(404).send({ error: 'Appointment token not found or invalid.' });
    }

    if (appointment.status === 'checked_in' || appointment.status === 'waiting') {
      return reply.send({ success: true, message: 'Patient already checked in.', appointment });
    }

    appointment.status = 'checked_in';
    appointment.checkInTime = new Date();
    await appointment.save();

    return reply.send({ success: true, message: 'Patient checked in successfully!', appointment });
  } catch (err) {
    return reply.code(500).send({ error: 'Check-in failed.', details: err.message });
  }
};

// 6. Get Live Waiting Room Queue
exports.getLiveQueue = async (request, reply) => {
  try {
    const { doctorId, date } = request.query || {};
    const todayStr = date || new Date().toISOString().split('T')[0];
    const filter = { appointmentDate: todayStr };

    if (doctorId && mongoose.Types.ObjectId.isValid(doctorId)) {
      filter.doctorId = doctorId;
    }

    const all = await Appointment.find(filter)
      .populate('patientId', 'name phone bloodGroup location')
      .populate('slotId', 'startTime endTime')
      .sort({ tokenNumber: 1 })
      .lean();

    const current = all.filter(a => a.status === 'in_consultation');
    const waiting = all.filter(a => a.status === 'checked_in' || a.status === 'waiting');
    const upcoming = all.filter(a => a.status === 'appointed' || a.status === 'requested');
    const completed = all.filter(a => a.status === 'completed');

    return reply.send({
      success: true,
      todayDate: todayStr,
      summary: {
        total: all.length,
        currentCount: current.length,
        waitingCount: waiting.length,
        upcomingCount: upcoming.length,
        completedCount: completed.length
      },
      queue: { current, waiting, upcoming, completed }
    });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to fetch live queue.', details: err.message });
  }
};

// 7. Get Appointments
exports.getAppointments = async (request, reply) => {
  try {
    const { role, entityModel } = request.user || {};
    const filter = {};

    if (entityModel === 'Organization') {
      const organization = await resolveOrganization(request.user || {});
      if (!organization) return reply.code(403).send({ error: 'Organization identity not found.' });
      const affiliatedDocIds = organization.affiliatedDoctors || [];
      filter.$or = [
        { organizationId: organization._id },
        ...(affiliatedDocIds.length > 0 ? [{ doctorId: { $in: affiliatedDocIds } }] : [])
      ];
    } else if (entityModel === 'User' || role === 'doctor' || role === 'patient') {
      const user = await resolveUserProfile(request.user || {});
      if (!user) return reply.code(403).send({ error: 'User identity not found.' });
      
      if (user.isDoctor || role === 'doctor') {
        const affiliatedOrgs = user.doctorDetails?.affiliatedOrganizations || [];
        const mainAffiliate = user.doctorDetails?.affiliateOrganization;
        const orgIds = [...affiliatedOrgs, ...(mainAffiliate ? [mainAffiliate] : [])].filter(id => mongoose.Types.ObjectId.isValid(id));

        filter.$or = [
          { doctorId: user._id },
          ...(orgIds.length > 0 ? [{ organizationId: { $in: orgIds } }] : [])
        ];
      } else {
        filter.patientId = user._id;
      }
    } else if (role === 'admin' || role === 'manager') {
      // Admin/Manager views all
    } else {
      return reply.code(403).send({ error: 'No appointment identity found.' });
    }

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

// 8. Update Status (Approved / Consultation / Cancel / Complete / Reject)
exports.updateAppointmentStatus = async (request, reply) => {
  try {
    const { appointmentId } = request.params || {};
    const { status, rejectionReason } = request.body || {};
    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) return reply.code(400).send({ error: 'Invalid appointmentId.' });
    if (!['requested', 'approved', 'appointed', 'checked_in', 'waiting', 'in_consultation', 'rejected', 'cancelled', 'completed'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid appointment status.' });
    }

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) return reply.code(404).send({ error: 'Appointment not found.' });

    if (status === 'in_consultation' && !appointment.consultationStartTime) {
      appointment.consultationStartTime = new Date();
    } else if (status === 'completed' && !appointment.consultationEndTime) {
      appointment.consultationEndTime = new Date();
    }

    appointment.status = status;
    if (status === 'rejected') {
      appointment.rejectionReason = rejectionReason || 'Rejected by provider.';
    }
    await appointment.save();

    return reply.send({ success: true, appointment });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to update appointment.', details: err.message });
  }
};

// 9. Full Update Appointment Endpoint
exports.updateAppointment = async (request, reply) => {
  try {
    const { appointmentId } = request.params || {};
    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) return reply.code(400).send({ error: 'Invalid appointmentId.' });

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) return reply.code(404).send({ error: 'Appointment not found.' });

    const { appointmentDate, notes, status, rejectionReason } = request.body || {};

    if (appointmentDate) appointment.appointmentDate = appointmentDate;
    if (notes !== undefined) appointment.notes = notes;
    if (status && ['requested', 'approved', 'appointed', 'checked_in', 'waiting', 'in_consultation', 'rejected', 'cancelled', 'completed'].includes(status)) {
      appointment.status = status;
    }
    if (rejectionReason !== undefined) appointment.rejectionReason = rejectionReason;

    await appointment.save();

    const updated = await Appointment.findById(appointmentId)
      .populate('organizationId', 'name facilityType location contactNumber')
      .populate('doctorId', 'name doctorDetails')
      .populate('patientId', 'name bloodGroup location')
      .populate('slotId', 'slotDate startTime endTime consultationMode fee');

    return reply.send({ success: true, appointment: updated });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to update appointment details.', details: err.message });
  }
};

// 10. Delete / Cancel Appointment Endpoint
exports.deleteAppointment = async (request, reply) => {
  try {
    const { appointmentId } = request.params || {};
    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) return reply.code(400).send({ error: 'Invalid appointmentId.' });

    const appointment = await Appointment.findByIdAndDelete(appointmentId);
    if (!appointment) return reply.code(404).send({ error: 'Appointment not found or already deleted.' });

    return reply.send({ success: true, message: 'Appointment deleted successfully.', deletedId: appointmentId });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to delete appointment.', details: err.message });
  }
};
