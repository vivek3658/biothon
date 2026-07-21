// controllers/adminController.js
const Manager = require('../models/Manager');
const bcrypt = require('bcrypt');

exports.createManager = async (request, reply) => {
  const { username, password, name, email } = request.body || {};

  if (!username || !password || username.trim().length === 0 || password.length < 6 || password.length > 20) {
    return reply.code(400).send({ error: 'Bad Request: Username required, password must be between 6 and 20 characters' });
  }

  const existingManager = await Manager.findOne({ username: username.toLowerCase().trim() });
  if (existingManager) {
    return reply.code(409).send({ error: 'Conflict: Manager username already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newManager = new Manager({
    username: username.toLowerCase().trim(),
    password: hashedPassword,
    name: name?.trim?.() || '',
    email: email?.toLowerCase?.().trim?.() || ''
  });

  await newManager.save();
  return reply.code(201).send({ success: true, managerId: newManager._id });
};

exports.getAllManagers = async (request, reply) => {
  const page = parseInt(request.query.page, 10) || 1;
  const limit = 10; 
  const skip = (page - 1) * limit;

  const total = await Manager.countDocuments();
  const managers = await Manager.find({}, '-password')
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    data: managers,
    pagination: {
      totalItems: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      itemsPerPage: limit
    }
  };
};

exports.getManagerById = async (request, reply) => {
  const manager = await Manager.findById(request.params.id, '-password').lean();
  if (!manager) {
    return reply.code(404).send({ error: 'Not Found: Manager record does not exist' });
  }
  return manager;
};

exports.updateManager = async (request, reply) => {
  const { username, password, name, email } = request.body || {};
  const updates = {};

  if (username && username.trim()) {
    const cleanUsername = username.toLowerCase().trim();
    const existing = await Manager.findOne({ username: cleanUsername, _id: { $ne: request.params.id } });
    if (existing) {
      return reply.code(409).send({ error: 'Conflict: Manager username already registered' });
    }
    updates.username = cleanUsername;
  }

  if (password) {
    if (password.length < 6 || password.length > 20) {
      return reply.code(400).send({ error: 'Bad Request: Password updates must be between 6 and 20 characters' });
    }
    updates.password = await bcrypt.hash(password, 10);
  }

  if (typeof name === 'string') updates.name = name.trim();
  if (typeof email === 'string') updates.email = email.toLowerCase().trim();

  const updatedManager = await Manager.findByIdAndUpdate(
    request.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).select('-password');

  if (!updatedManager) {
    return reply.code(404).send({ error: 'Not Found: Unable to update non-existent Manager' });
  }

  return { success: true, data: updatedManager };
};

exports.deleteManager = async (request, reply) => {
  const deleted = await Manager.findByIdAndDelete(request.params.id);
  if (!deleted) {
    return reply.code(404).send({ error: 'Not Found: Unable to delete non-existent Manager' });
  }
  return { success: true, message: 'Manager deleted successfully' };
};

exports.seedAllRecords = async (request, reply) => {
  const { seedDatabase } = require('../utils/databaseSeeder');
  await seedDatabase();
  return reply.send({ success: true, message: 'Seeded 10 Patients, 10 Doctors, 10 Hospitals, 10 Clinics, and 10 Laboratories near Ahmedabad.' });
};
