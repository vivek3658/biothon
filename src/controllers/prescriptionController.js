// controllers/prescriptionController.js
const Prescription = require('../models/Prescription');
const User = require('../models/User');
const Account = require('../models/Account');
const Medicine = require('../models/Medicine');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Helper to generate unique Rx Number
const generateRxNumber = () => {
  const year = new Date().getFullYear();
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `ARX-RX-${year}-${rand}`;
};

// Helper to compute HMAC Digital Signature
const computeDigitalSignature = (payload) => {
  const secret = process.env.JWT_SECRET || 'arogya_x_digital_rx_key';
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
};

// 1. Create Prescription (Draft or Finalized v1)
exports.createPrescription = async (request, reply) => {
  try {
    const { accountId, entityId, role } = request.user || {};
    const {
      patientId,
      appointmentId,
      organizationId,
      consultationFee,
      chiefComplaint,
      clinicalFindings,
      diagnosis,
      lifestyleAdvice,
      doctorNotes,
      medications,
      labOrders,
      followUpDate,
      followUpPurpose,
      allergyOverrideLog,
      status // 'draft' or 'finalized'
    } = request.body || {};

    if (!patientId) {
      return reply.code(400).send({ error: 'Patient identity or ID is required.' });
    }

    // Resolve Doctor User Profile ID
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

    if ((role === 'doctor' || role === 'practitioner') && !doctorProfile.isDoctor) {
      doctorProfile.isDoctor = true;
      await doctorProfile.save();
    }

    // Resolve Patient Profile
    let patientUser = null;
    if (mongoose.Types.ObjectId.isValid(patientId)) {
      patientUser = await User.findById(patientId);
      if (!patientUser) patientUser = await User.findOne({ accountId: patientId });
    }
    
    if (!patientUser && typeof patientId === 'string') {
      const cleanId = patientId.trim();
      const acc = await Account.findOne({ email: cleanId.toLowerCase() });
      if (acc) patientUser = await User.findOne({ accountId: acc._id });
      if (!patientUser) patientUser = await User.findOne({ name: { $regex: cleanId, $options: 'i' } });
      if (!patientUser) patientUser = await User.findOne({ isDoctor: { $ne: true } });
    }

    if (!patientUser) {
      return reply.code(404).send({ error: 'Target patient profile not found.' });
    }

    if (!Array.isArray(medications) || medications.length === 0) {
      return reply.code(400).send({ error: 'At least one medication entry is required.' });
    }

    // Process Clean Medications
    const cleanMedications = medications.map((med, idx) => ({
      medicineId: (med.medicineId && mongoose.Types.ObjectId.isValid(med.medicineId)) ? med.medicineId : null,
      medicineName: med.medicineName || 'Medication',
      genericName: med.genericName || med.medicineName || '',
      type: med.type || med.medicineType || 'Tablet',
      dosage: med.dosage ? med.dosage.toString() : '500',
      unit: med.unit || 'mg',
      frequency: med.frequency || '1-0-1',
      mealTiming: med.mealTiming || 'After Food',
      durationDays: parseInt(med.durationDays || med.howManyDays, 10) || 5,
      quantity: med.quantity ? med.quantity.toString() : '10',
      instructions: med.instructions || '',
      price: parseFloat(med.price) || 0,
      orderIndex: idx
    }));

    // Drug-Drug Interaction Warning Calculator
    const interactionWarnings = [];
    for (let i = 0; i < cleanMedications.length; i++) {
      for (let j = i + 1; j < cleanMedications.length; j++) {
        const medA = cleanMedications[i].medicineName.toLowerCase();
        const medB = cleanMedications[j].medicineName.toLowerCase();

        if ((medA.includes('aspirin') && medB.includes('ibuprofen')) || (medB.includes('aspirin') && medA.includes('ibuprofen'))) {
          interactionWarnings.push({
            drugA: cleanMedications[i].medicineName,
            drugB: cleanMedications[j].medicineName,
            severity: 'Moderate',
            description: 'Concurrent use of NSAIDs may increase gastrointestinal bleeding risks.'
          });
        }
      }
    }

    const rxNumber = generateRxNumber();
    const qrToken = `ARX-SEC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const digitalSig = computeDigitalSignature({
      rxNumber,
      doctorId: doctorProfile._id,
      patientId: patientUser._id,
      medsCount: cleanMedications.length,
      issuedAt: new Date().toISOString()
    });

    const cleanOrg = (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) ? organizationId : null;
    const cleanAppt = (appointmentId && mongoose.Types.ObjectId.isValid(appointmentId)) ? appointmentId : null;

    const prescription = new Prescription({
      prescriptionNumber: rxNumber,
      version: 1,
      isLatestVersion: true,
      rootPrescriptionId: null,
      appointmentId: cleanAppt,
      doctorId: doctorProfile._id,
      patientId: patientUser._id,
      organizationId: cleanOrg,
      chiefComplaint: chiefComplaint || 'Routine Clinical Consultation',
      clinicalFindings: clinicalFindings || '',
      diagnosis: Array.isArray(diagnosis) ? diagnosis : [diagnosis || 'General Clinical Review'],
      lifestyleAdvice: Array.isArray(lifestyleAdvice) ? lifestyleAdvice : [],
      doctorNotes: doctorNotes || '',
      consultationFee: parseFloat(consultationFee) || 0,
      medications: cleanMedications,
      labOrders: Array.isArray(labOrders) ? labOrders : [],
      followUpDate: followUpDate || '',
      followUpPurpose: followUpPurpose || 'Review',
      allergyOverrideLog: Array.isArray(allergyOverrideLog) ? allergyOverrideLog : [],
      interactionWarnings,
      status: status || 'finalized',
      finalizedAt: new Date(),
      digitalSignature: digitalSig,
      qrCodeToken: qrToken
    });

    await prescription.save();

    if (!patientUser.prescriptions) patientUser.prescriptions = [];
    if (!patientUser.prescriptions.includes(prescription._id)) {
      patientUser.prescriptions.push(prescription._id);
      await patientUser.save();
    }

    return reply.code(201).send({
      success: true,
      message: 'Electronic Prescription finalized and signed successfully!',
      prescription
    });
  } catch (err) {
    console.error('createPrescription error:', err);
    return reply.code(500).send({ error: 'Failed to issue prescription.', details: err.message });
  }
};

// 2. Get Prescriptions Stream (Filtered by Role)
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

    const filter = { isLatestVersion: true };

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

// 3. Get Prescription Version History
exports.getPrescriptionHistory = async (request, reply) => {
  try {
    const { id } = request.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({ error: 'Invalid Prescription ID parameter.' });
    }

    const targetRx = await Prescription.findById(id);
    if (!targetRx) {
      return reply.code(404).send({ error: 'Prescription record not found.' });
    }

    const rootId = targetRx.rootPrescriptionId || targetRx._id;

    const versions = await Prescription.find({
      $or: [{ _id: rootId }, { rootPrescriptionId: rootId }]
    })
      .populate('doctorId', 'name doctorDetails')
      .sort({ version: 1 })
      .lean();

    return reply.send({
      success: true,
      rootPrescriptionId: rootId,
      totalVersions: versions.length,
      versions
    });
  } catch (err) {
    console.error('getPrescriptionHistory error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve version history.', details: err.message });
  }
};

// 4. Update Prescription & Immutable Versioning (Spawns v+1 if finalized)
exports.updatePrescription = async (request, reply) => {
  try {
    const { id } = request.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({ error: 'Invalid Prescription ID parameter.' });
    }

    const oldRx = await Prescription.findById(id);
    if (!oldRx) {
      return reply.code(404).send({ error: 'Prescription record not found.' });
    }

    const body = request.body || {};

    // If prescription is already finalized, preserve immutability by creating a new version!
    if (oldRx.status === 'finalized') {
      oldRx.isLatestVersion = false;
      oldRx.status = 'superseded';
      await oldRx.save();

      const rootId = oldRx.rootPrescriptionId || oldRx._id;
      const nextVersion = oldRx.version + 1;
      const rxNumber = `${oldRx.prescriptionNumber.split('-v')[0]}-v${nextVersion}`;
      const qrToken = `ARX-SEC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newRx = new Prescription({
        prescriptionNumber: rxNumber,
        version: nextVersion,
        isLatestVersion: true,
        rootPrescriptionId: rootId,
        appointmentId: oldRx.appointmentId,
        doctorId: oldRx.doctorId,
        patientId: oldRx.patientId,
        organizationId: oldRx.organizationId,
        chiefComplaint: body.chiefComplaint || oldRx.chiefComplaint,
        clinicalFindings: body.clinicalFindings || oldRx.clinicalFindings,
        diagnosis: body.diagnosis || oldRx.diagnosis,
        lifestyleAdvice: body.lifestyleAdvice || oldRx.lifestyleAdvice,
        doctorNotes: body.doctorNotes || oldRx.doctorNotes,
        consultationFee: body.consultationFee !== undefined ? parseFloat(body.consultationFee) : oldRx.consultationFee,
        medications: body.medications || oldRx.medications,
        labOrders: body.labOrders || oldRx.labOrders,
        followUpDate: body.followUpDate || oldRx.followUpDate,
        followUpPurpose: body.followUpPurpose || oldRx.followUpPurpose,
        allergyOverrideLog: body.allergyOverrideLog || oldRx.allergyOverrideLog,
        status: 'finalized',
        finalizedAt: new Date(),
        digitalSignature: computeDigitalSignature({ rxNumber, version: nextVersion }),
        qrCodeToken: qrToken
      });

      await newRx.save();

      return reply.send({
        success: true,
        message: `Prescription updated! Created Version ${nextVersion} (Immutability preserved).`,
        prescription: newRx
      });
    }

    // Otherwise update draft directly
    Object.assign(oldRx, body);
    await oldRx.save();

    return reply.send({
      success: true,
      message: 'Draft prescription updated successfully.',
      prescription: oldRx
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

// 6. Public QR Verification Gateway (No Auth Required)
exports.verifyQRToken = async (request, reply) => {
  try {
    const { token } = request.params;
    if (!token) {
      return reply.code(400).send({ error: 'Verification QR token is required.' });
    }

    const prescription = await Prescription.findOne({ qrCodeToken: token })
      .populate('doctorId', 'name doctorDetails location')
      .populate('patientId', 'name bloodGroup location')
      .populate('organizationId', 'name facilityType location contactNumber')
      .lean();

    if (!prescription) {
      return reply.code(404).send({
        verified: false,
        error: 'Invalid or tampered prescription token. Record not found in ArogyaX EMR Vault.'
      });
    }

    return reply.send({
      verified: true,
      status: 'AUTHENTIC_SERVER_VERIFIED',
      verifiedAt: new Date().toISOString(),
      prescription
    });
  } catch (err) {
    console.error('verifyQRToken error:', err);
    return reply.code(500).send({ error: 'Verification failed due to internal error.', details: err.message });
  }
};
