const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const User = require('../models/User');
const Organization = require('../models/Organization');

const AHMEDABAD_BASE_LAT = 23.0225;
const AHMEDABAD_BASE_LNG = 72.5714;

const getRandomLocation = (offsetRange = 0.08) => {
  const lat = (AHMEDABAD_BASE_LAT + (Math.random() - 0.5) * offsetRange).toFixed(4);
  const lng = (AHMEDABAD_BASE_LNG + (Math.random() - 0.5) * offsetRange).toFixed(4);
  return { lat: parseFloat(lat), lng: parseFloat(lng) };
};

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const specialities = [
  'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Dermatology',
  'Gynecology', 'General Medicine', 'ENT', 'Ophthalmology', 'Oncology'
];

exports.seedDatabase = async () => {
  console.log('🌱 Starting database seeding & account repair for Ahmedabad region...');

  // Auto-Repair any corrupted user accounts in DB
  try {
    const allUsers = await User.find();
    for (const u of allUsers) {
      if (u.accountId) {
        const acc = await Account.findById(u.accountId);
        if (acc) {
          acc.entityModel = 'User';
          acc.entityId = u._id;
          acc.role = u.isDoctor ? 'doctor' : 'patient';
          await acc.save();
          await Organization.deleteMany({ accountId: acc._id });
        }
      }
    }
  } catch (err) {
    console.error('Account repair note:', err.message);
  }

  const hashedPassword = await bcrypt.hash('password', 10);

  // 1. Seed 10 Hospitals (8 Approved, 2 Pending)
  const hospitalOrgs = [];
  for (let i = 1; i <= 10; i++) {
    const email = `hospital${i}@gmail.com`;
    let account = await Account.findOne({ email });
    const isApproved = i <= 8;
    const loc = getRandomLocation();

    if (!account) {
      const accountId = new mongoose.Types.ObjectId();
      const orgId = new mongoose.Types.ObjectId();

      const org = await Organization.create({
        _id: orgId,
        accountId: accountId,
        name: `Ahmedabad City Hospital ${i}`,
        facilityType: 'hospital',
        contactNumber: `987654321${i % 10}`,
        verificationStatus: isApproved ? 'approved' : 'pending',
        organizationCertificateNo: `HOSP-AHM-${202600 + i}`,
        organizationCertificateUrl: `https://example.com/certs/hospital${i}.pdf`,
        location: {
          buildingNo: `Building H-${i}`,
          floorNo: (i % 5) + 1,
          landmark: `Near SG Highway Ring ${i}`,
          city: 'Ahmedabad',
          state: 'Gujarat',
          pincode: '380001'
        },
        coordinates: [loc.lng, loc.lat]
      });

      account = await Account.create({
        _id: accountId,
        email,
        password: hashedPassword,
        authProvider: 'local',
        role: 'hospital',
        entityId: org._id,
        entityModel: 'Organization'
      });

      hospitalOrgs.push(org);
    } else {
      const existingOrg = await Organization.findById(account.entityId);
      if (existingOrg) hospitalOrgs.push(existingOrg);
    }
  }

  // 2. Seed 10 Clinics (8 Approved, 2 Pending)
  const clinicOrgs = [];
  for (let i = 1; i <= 10; i++) {
    const email = `clinic${i}@gmail.com`;
    let account = await Account.findOne({ email });
    const isApproved = i <= 8;
    const loc = getRandomLocation();

    if (!account) {
      const accountId = new mongoose.Types.ObjectId();
      const orgId = new mongoose.Types.ObjectId();

      const org = await Organization.create({
        _id: orgId,
        accountId: accountId,
        name: `Care Plus Clinic ${i}`,
        facilityType: 'clinic',
        contactNumber: `987654322${i % 10}`,
        verificationStatus: isApproved ? 'approved' : 'pending',
        organizationCertificateNo: `CLINIC-AHM-${202600 + i}`,
        organizationCertificateUrl: `https://example.com/certs/clinic${i}.pdf`,
        location: {
          buildingNo: `Shop C-${i}`,
          floorNo: 1,
          landmark: `Navrangpura Market ${i}`,
          city: 'Ahmedabad',
          state: 'Gujarat',
          pincode: '380009'
        },
        coordinates: [loc.lng, loc.lat]
      });

      account = await Account.create({
        _id: accountId,
        email,
        password: hashedPassword,
        authProvider: 'local',
        role: 'clinic',
        entityId: org._id,
        entityModel: 'Organization'
      });

      clinicOrgs.push(org);
    } else {
      const existingOrg = await Organization.findById(account.entityId);
      if (existingOrg) clinicOrgs.push(existingOrg);
    }
  }

  // 3. Seed 10 Laboratories (8 Approved, 2 Pending)
  for (let i = 1; i <= 10; i++) {
    const email = `lab${i}@gmail.com`;
    let account = await Account.findOne({ email });
    const isApproved = i <= 8;
    const loc = getRandomLocation();

    if (!account) {
      const accountId = new mongoose.Types.ObjectId();
      const orgId = new mongoose.Types.ObjectId();

      const org = await Organization.create({
        _id: orgId,
        accountId: accountId,
        name: `Precision Path Labs ${i}`,
        facilityType: 'laboratory',
        contactNumber: `987654323${i % 10}`,
        verificationStatus: isApproved ? 'approved' : 'pending',
        organizationCertificateNo: `LAB-AHM-${202600 + i}`,
        organizationCertificateUrl: `https://example.com/certs/lab${i}.pdf`,
        location: {
          buildingNo: `Lab Plaza ${i}`,
          floorNo: 1,
          landmark: `Ashram Road ${i}`,
          city: 'Ahmedabad',
          state: 'Gujarat',
          pincode: '380014'
        },
        coordinates: [loc.lng, loc.lat]
      });

      account = await Account.create({
        _id: accountId,
        email,
        password: hashedPassword,
        authProvider: 'local',
        role: 'laboratory',
        entityId: org._id,
        entityModel: 'Organization'
      });
    }
  }

  // Combine approved hospital & clinic orgs for doctor affiliation
  const approvedOrgs = [...hospitalOrgs, ...clinicOrgs].filter(o => o.verificationStatus === 'approved');

  // 4. Seed 10 Doctors (All Approved & Affiliated to an Org)
  for (let i = 1; i <= 10; i++) {
    const email = `doctor${i}@gmail.com`;
    let account = await Account.findOne({ email });
    const loc = getRandomLocation();
    const assignedOrg = approvedOrgs[(i - 1) % approvedOrgs.length];

    if (!account) {
      const accountId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const user = await User.create({
        _id: userId,
        accountId: accountId,
        name: `Dr. Rajesh Patel ${i}`,
        isDoctor: true,
        bloodGroup: bloodGroups[i % bloodGroups.length],
        doctorDetails: {
          speciality: specialities[i - 1],
          certificateNo: `MCI-AHM-${99000 + i}`,
          certificateDoc: `https://example.com/certs/doctor${i}.pdf`,
          affiliatedOrganizations: assignedOrg ? [assignedOrg._id] : []
        },
        location: {
          houseNo: `Flat D-${i}`,
          roomNo: `10${i}`,
          floorNo: (i % 4) + 1,
          landmark: `Bodakdev Road ${i}`,
          city: 'Ahmedabad',
          state: 'Gujarat',
          pincode: '380054'
        },
        coordinates: [loc.lng, loc.lat]
      });

      account = await Account.create({
        _id: accountId,
        email,
        password: hashedPassword,
        authProvider: 'local',
        role: 'doctor',
        entityId: user._id,
        entityModel: 'User'
      });

      if (assignedOrg) {
        if (!assignedOrg.affiliatedDoctors) assignedOrg.affiliatedDoctors = [];
        if (!assignedOrg.affiliatedDoctors.includes(user._id)) {
          assignedOrg.affiliatedDoctors.push(user._id);
          await assignedOrg.save();
        }
      }
    }
  }

  // 5. Seed 10 Patients
  for (let i = 1; i <= 10; i++) {
    const email = `user${i}@gmail.com`;
    let account = await Account.findOne({ email });
    const loc = getRandomLocation();

    if (!account) {
      const accountId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const user = await User.create({
        _id: userId,
        accountId: accountId,
        name: `Patient Amit Shah ${i}`,
        isDoctor: false,
        bloodGroup: bloodGroups[(i + 2) % bloodGroups.length],
        location: {
          houseNo: `House P-${i}`,
          roomNo: `B-${i}`,
          floorNo: (i % 3),
          landmark: `Satellite Area ${i}`,
          city: 'Ahmedabad',
          state: 'Gujarat',
          pincode: '380015'
        },
        coordinates: [loc.lng, loc.lat]
      });

      account = await Account.create({
        _id: accountId,
        email,
        password: hashedPassword,
        authProvider: 'local',
        role: 'patient',
        entityId: user._id,
        entityModel: 'User'
      });
    }
  }

  console.log('✅ Database successfully seeded with 10 Patients, 10 Doctors, 10 Hospitals, 10 Clinics, and 10 Laboratories around Ahmedabad!');
};
