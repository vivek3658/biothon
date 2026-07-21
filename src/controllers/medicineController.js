// controllers/medicineController.js
const Medicine = require('../models/Medicine');
const medicineSeedData = require('../utils/medicineSeedData');

const ensureSeededCatalog = async () => {
  try {
    const count = await Medicine.countDocuments();
    if (count < 100) {
      for (const item of medicineSeedData) {
        await Medicine.updateOne(
          { medicineName: item.medicineName },
          { $setOnInsert: item },
          { upsert: true }
        );
      }
    }
  } catch (e) {}
};

// 1. Create New Medicine (Admin Only)
exports.createMedicine = async (request, reply) => {
  try {
    const {
      medicineName,
      type,
      dosage,
      unit,
      category,
      manufacturer,
      prescriptionRequired,
      instructions,
      sideEffects,
      precautions
    } = request.body || {};

    if (!medicineName || !medicineName.trim()) {
      return reply.code(400).send({ error: 'Medicine name is required.' });
    }

    const existing = await Medicine.findOne({ medicineName: medicineName.trim() });
    if (existing) {
      return reply.code(409).send({ error: 'A medicine with this name already exists in the catalog.' });
    }

    let cleanDosages = [500];
    if (Array.isArray(dosage) && dosage.length > 0) {
      cleanDosages = dosage.map(d => parseFloat(d)).filter(d => !isNaN(d) && d > 0);
    } else if (typeof dosage === 'string') {
      cleanDosages = dosage.split(',').map(d => parseFloat(d.trim())).filter(d => !isNaN(d) && d > 0);
    }

    const medicine = new Medicine({
      medicineName: medicineName.trim(),
      type: type || 'oral_tablet',
      dosage: cleanDosages.length > 0 ? cleanDosages : [500],
      unit: unit || 'mg',
      category: category || 'General',
      manufacturer: manufacturer || '',
      prescriptionRequired: prescriptionRequired !== undefined ? Boolean(prescriptionRequired) : true,
      instructions: instructions || 'Take as directed by practitioner.',
      sideEffects: sideEffects || '',
      precautions: precautions || ''
    });

    await medicine.save();

    return reply.code(201).send({
      success: true,
      message: 'Medicine added to master catalog successfully.',
      medicine
    });
  } catch (err) {
    console.error('createMedicine error:', err);
    return reply.code(500).send({ error: 'Failed to create medicine.', details: err.message });
  }
};

// 2. Get All Medicines (Admin & Doctor Search with Pagination & Category Filtering)
exports.getAllMedicines = async (request, reply) => {
  try {
    await ensureSeededCatalog();

    const page = parseInt(request.query.page, 10) || 1;
    const limit = parseInt(request.query.limit, 10) || 20;
    const search = request.query.search || '';
    const category = request.query.category || '';
    const type = request.query.type || '';

    const filter = {};
    if (search.trim()) {
      filter.$or = [
        { medicineName: { $regex: search.trim(), $options: 'i' } },
        { category: { $regex: search.trim(), $options: 'i' } },
        { manufacturer: { $regex: search.trim(), $options: 'i' } }
      ];
    }
    if (category.trim()) filter.category = category.trim();
    if (type.trim()) filter.type = type.trim();

    const skip = (page - 1) * limit;
    const total = await Medicine.countDocuments(filter);
    const medicines = await Medicine.find(filter)
      .sort({ medicineName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return reply.send({
      success: true,
      data: medicines,
      pagination: {
        totalItems: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error('getAllMedicines error:', err);
    return reply.code(500).send({ error: 'Failed to fetch medicines catalog.', details: err.message });
  }
};

// 3. Get Single Medicine by ID
exports.getMedicineById = async (request, reply) => {
  try {
    const medicine = await Medicine.findById(request.params.id);
    if (!medicine) {
      return reply.code(404).send({ error: 'Medicine not found.' });
    }
    return reply.send({ success: true, medicine });
  } catch (err) {
    console.error('getMedicineById error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve medicine details.', details: err.message });
  }
};

// 4. Update Medicine (Admin Only)
exports.updateMedicine = async (request, reply) => {
  try {
    const { id } = request.params;
    const medicine = await Medicine.findById(id);

    if (!medicine) {
      return reply.code(404).send({ error: 'Medicine not found.' });
    }

    const {
      medicineName,
      type,
      dosage,
      unit,
      category,
      manufacturer,
      prescriptionRequired,
      instructions,
      sideEffects,
      precautions
    } = request.body || {};

    if (medicineName && medicineName.trim() !== medicine.medicineName) {
      const existing = await Medicine.findOne({ medicineName: medicineName.trim() });
      if (existing) {
        return reply.code(409).send({ error: 'Another medicine with this name already exists.' });
      }
      medicine.medicineName = medicineName.trim();
    }

    if (type) medicine.type = type;
    if (unit) medicine.unit = unit;
    if (category !== undefined) medicine.category = category;
    if (manufacturer !== undefined) medicine.manufacturer = manufacturer;
    if (prescriptionRequired !== undefined) medicine.prescriptionRequired = Boolean(prescriptionRequired);
    if (instructions !== undefined) medicine.instructions = instructions;
    if (sideEffects !== undefined) medicine.sideEffects = sideEffects;
    if (precautions !== undefined) medicine.precautions = precautions;

    if (dosage) {
      let cleanDosages = [];
      if (Array.isArray(dosage)) {
        cleanDosages = dosage.map(d => parseFloat(d)).filter(d => !isNaN(d) && d > 0);
      } else if (typeof dosage === 'string') {
        cleanDosages = dosage.split(',').map(d => parseFloat(d.trim())).filter(d => !isNaN(d) && d > 0);
      }
      if (cleanDosages.length > 0) medicine.dosage = cleanDosages;
    }

    await medicine.save();

    return reply.send({
      success: true,
      message: 'Medicine updated successfully.',
      medicine
    });
  } catch (err) {
    console.error('updateMedicine error:', err);
    return reply.code(500).send({ error: 'Failed to update medicine.', details: err.message });
  }
};

// 5. Delete Medicine (Admin Only)
exports.deleteMedicine = async (request, reply) => {
  try {
    const { id } = request.params;
    const deleted = await Medicine.findByIdAndDelete(id);

    if (!deleted) {
      return reply.code(404).send({ error: 'Medicine not found.' });
    }

    return reply.send({
      success: true,
      message: 'Medicine removed from catalog successfully.'
    });
  } catch (err) {
    console.error('deleteMedicine error:', err);
    return reply.code(500).send({ error: 'Failed to delete medicine.', details: err.message });
  }
};

// 6. Seed 100 Master Medicine Records (Admin Only / On-Demand)
exports.seedMedicines = async (request, reply) => {
  try {
    let insertedCount = 0;
    for (const item of medicineSeedData) {
      const res = await Medicine.updateOne(
        { medicineName: item.medicineName },
        { $setOnInsert: item },
        { upsert: true }
      );
      if (res.upsertedCount > 0) insertedCount++;
    }
    const total = await Medicine.countDocuments();
    return reply.send({
      success: true,
      message: `Master Medicine Catalog initialized with 100 records!`,
      newRecordsInserted: insertedCount,
      totalCatalogSize: total
    });
  } catch (err) {
    console.error('seedMedicines error:', err);
    return reply.code(500).send({ error: 'Failed to seed medicine catalog.', details: err.message });
  }
};
