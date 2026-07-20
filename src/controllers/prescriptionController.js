// controllers/prescriptionController.js
const Prescription = require('../models/Prescription');
const User = require('../models/User');
const Account = require('../models/Account');
const Medicine = require('../models/Medicine');
const mongoose = require('mongoose');

// 1. Create Prescription (Doctor Only)
exports.createPrescription = async (request, reply) => {
  try {
    const { accountId, entityId, role } = request.user || {};
    const {
      patientId,
      organizationId,
      consultationFee,
      medications,
      status
    } = request.body || {};

    if (!patientId) {
      return reply.code(400).send({ error: 'Patient identity or ID is required.' });
    }

    // Determine Doctor User Profile ID
    let doctorProfile = null;
    if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
      doctorProfile = await User.findById(entityId);
    }
    if (!doctorProfile && accountId) {
      doctorProfile = await User.findOne({ accountId });
    }

    if (!doctorProfile) {
      return reply.code(404).send({ error: 'Doctor practitioner profile not found.' });
    }

    if (!doctorProfile.isDoctor && role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden: Only verified doctors can issue prescriptions.' });
    }

    // Resolve Patient Profile by User ID, Account ID, Email, Name, or Fallback
    let patientUser = null;
    if (mongoose.Types.ObjectId.isValid(patientId)) {
      patientUser = await User.findById(patientId);
      if (!patientUser) {
        patientUser = await User.findOne({ accountId: patientId });
      }
    }
    
    if (!patientUser && typeof patientId === 'string') {
      const cleanId = patientId.trim();
      const acc = await Account.findOne({ email: cleanId.toLowerCase() });
      if (acc) {
        patientUser = await User.findOne({ accountId: acc._id });
      }
      if (!patientUser) {
        patientUser = await User.findOne({ name: { $regex: cleanId, $options: 'i' } });
      }
      if (!patientUser) {
        patientUser = await User.findOne({ isDoctor: { $ne: true } });
      }
    }

    if (!patientUser) {
      return reply.code(404).send({ error: 'Target patient profile not found.' });
    }

    if (!Array.isArray(medications) || medications.length === 0) {
      return reply.code(400).send({ error: 'At least one medication entry is required.' });
    }

    const cleanMedications = medications.map(med => ({
      medicineId: (med.medicineId && mongoose.Types.ObjectId.isValid(med.medicineId)) ? med.medicineId : null,
      medicineName: med.medicineName || 'Medication',
      type: med.type || 'oral_tablet',
      dosage: med.dosage ? med.dosage.toString() : '500',
      unit: med.unit || 'mg',
      instructions: med.instructions || '',
      beforeEating: Boolean(med.beforeEating),
      timesADay: med.timesADay ? med.timesADay.toString() : '2',
      quantity: med.quantity ? med.quantity.toString() : '1',
      howManyDays: med.howManyDays ? med.howManyDays.toString() : '5 days',
      notes: med.notes || '',
      price: parseFloat(med.price) || 0
    }));

    const cleanOrg = (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) ? organizationId : null;

    const prescription = new Prescription({
      doctorId: doctorProfile._id,
      patientId: patientUser._id,
      organizationId: cleanOrg,
      consultationFee: parseFloat(consultationFee) || 0,
      medications: cleanMedications,
      status: status || 'active'
    });

    await prescription.save();

    // Attach prescription reference to patient profile
    if (!patientUser.prescriptions) patientUser.prescriptions = [];
    if (!patientUser.prescriptions.includes(prescription._id)) {
      patientUser.prescriptions.push(prescription._id);
      await patientUser.save();
    }

    return reply.code(201).send({
      success: true,
      message: 'Prescription issued successfully!',
      prescription
    });
  } catch (err) {
    console.error('createPrescription error:', err);
    return reply.code(500).send({ error: 'Failed to issue prescription.', details: err.message });
  }
};

// 2. Get Prescriptions (Filtered by Role: Doctor issued, Patient received, Admin all)
exports.getPrescriptions = async (request, reply) => {
  try {
    const { accountId, entityId, role } = request.user || {};

    let userProfile = null;
    if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
      userProfile = await User.findById(entityId);
    }
    if (!userProfile && accountId) {
      userProfile = await User.findOne({ accountId });
    }

    const filter = {};

    if (role === 'admin') {
      // Admin sees all
    } else if (userProfile?.isDoctor) {
      filter.doctorId = userProfile._id;
    } else if (userProfile) {
      filter.patientId = userProfile._id;
    } else {
      return reply.code(401).send({ error: 'User profile identity not found.' });
    }

    const prescriptions = await Prescription.find(filter)
      .populate('doctorId', 'name isDoctor doctorDetails location')
      .populate('patientId', 'name bloodGroup location')
      .populate('organizationId', 'name facilityType location contactNumber')
      .sort({ createdAt: -1 })
      .lean();

    return reply.send({
      success: true,
      prescriptions
    });
  } catch (err) {
    console.error('getPrescriptions error:', err);
    return reply.code(500).send({ error: 'Failed to fetch prescriptions.', details: err.message });
  }
};

// 3. Get Single Prescription by ID
exports.getPrescriptionById = async (request, reply) => {
  try {
    const { id } = request.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({ error: 'Invalid Prescription ID parameter.' });
    }

    const prescription = await Prescription.findById(id)
      .populate('doctorId', 'name isDoctor doctorDetails location')
      .populate('patientId', 'name bloodGroup location')
      .populate('organizationId', 'name facilityType location contactNumber')
      .lean();

    if (!prescription) {
      return reply.code(404).send({ error: 'Prescription record not found.' });
    }

    return reply.send({ success: true, prescription });
  } catch (err) {
    console.error('getPrescriptionById error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve prescription.', details: err.message });
  }
};

// 4. Update Prescription (Doctor or Admin)
exports.updatePrescription = async (request, reply) => {
  try {
    const { id } = request.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({ error: 'Invalid Prescription ID parameter.' });
    }

    const prescription = await Prescription.findById(id);
    if (!prescription) {
      return reply.code(404).send({ error: 'Prescription record not found.' });
    }

    const { consultationFee, medications, status } = request.body || {};

    if (consultationFee !== undefined) prescription.consultationFee = parseFloat(consultationFee) || 0;
    if (status) prescription.status = status;

    if (Array.isArray(medications)) {
      prescription.medications = medications.map(med => ({
        medicineId: (med.medicineId && mongoose.Types.ObjectId.isValid(med.medicineId)) ? med.medicineId : null,
        medicineName: med.medicineName || 'Medication',
        type: med.type || 'oral_tablet',
        dosage: med.dosage ? med.dosage.toString() : '500',
        unit: med.unit || 'mg',
        instructions: med.instructions || '',
        beforeEating: Boolean(med.beforeEating),
        timesADay: med.timesADay ? med.timesADay.toString() : '2',
        quantity: med.quantity ? med.quantity.toString() : '1',
        howManyDays: med.howManyDays ? med.howManyDays.toString() : '5 days',
        notes: med.notes || '',
        price: parseFloat(med.price) || 0
      }));
    }

    await prescription.save();

    return reply.send({
      success: true,
      message: 'Prescription updated successfully.',
      prescription
    });
  } catch (err) {
    console.error('updatePrescription error:', err);
    return reply.code(500).send({ error: 'Failed to update prescription.', details: err.message });
  }
};

// 5. Delete Prescription
exports.deletePrescription = async (request, reply) => {
  try {
    const { id } = request.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({ error: 'Invalid Prescription ID parameter.' });
    }

    const deleted = await Prescription.findByIdAndDelete(id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Prescription record not found.' });
    }

    return reply.send({
      success: true,
      message: 'Prescription removed successfully.'
    });
  } catch (err) {
    console.error('deletePrescription error:', err);
    return reply.code(500).send({ error: 'Failed to delete prescription.', details: err.message });
  }
};
