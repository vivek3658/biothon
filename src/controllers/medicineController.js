// controllers/medicineController.js
const Medicine = require('../models/Medicine');
const medicineSeedData = require('../utils/medicineSeedData');

const ensureSeededCatalog = async () => {
  try {
    const count = await Medicine.countDocuments();
    if (count < 10) {
      for (const item of medicineSeedData) {
        await Medicine.updateOne(
          { medicineName: item.medicineName },
          { 
            $setOnInsert: {
              medicineName: item.medicineName,
              genericName: item.genericName || item.medicineName,
              brandName: item.brandName || item.medicineName,
              manufacturer: item.manufacturer || 'ArogyaX Pharma',
              medicineType: item.medicineType || 'Tablet',
              strength: item.strength || '500mg',
              composition: item.composition || [item.medicineName],
              category: item.category || 'General',
              scheduleType: item.scheduleType || 'OTC',
              requiresPrescription: item.requiresPrescription !== undefined ? item.requiresPrescription : true,
              defaultInstructions: item.defaultInstructions || 'Take as directed by practitioner.',
              pregnancyCategory: 'B',
              childSafe: true,
              seniorSafe: true,
              status: 'active',
              isDeleted: false
            }
          },
          { upsert: true }
        );
      }
    }
  } catch (e) {}
};

// 1. Create New Medicine (Admin Only) with Duplicate Check
exports.createMedicine = async (request, reply) => {
  try {
    const {
      medicineName,
      genericName,
      brandName,
      manufacturer,
      medicineType,
      strength,
      composition,
      category,
      scheduleType,
      requiresPrescription,
      availableStrengths,
      availablePackSizes,
      defaultInstructions,
      commonSideEffects,
      contraindications,
      storageInstructions,
      pregnancyCategory,
      childSafe,
      seniorSafe
    } = request.body || {};

    if (!medicineName || !medicineName.trim()) {
      return reply.code(400).send({ error: 'Medicine name is required.' });
    }

    // Duplicate Check: Same Name & Strength
    const existing = await Medicine.findOne({ 
      medicineName: medicineName.trim(), 
      strength: strength || '500mg',
      isDeleted: { $ne: true } 
    });

    if (existing) {
      return reply.code(409).send({ error: `Duplicate detected: "${medicineName}" (${strength || '500mg'}) already exists in the master catalog.` });
    }

    const medicine = new Medicine({
      medicineName: medicineName.trim(),
      genericName: genericName ? genericName.trim() : medicineName.trim(),
      brandName: brandName ? brandName.trim() : medicineName.trim(),
      manufacturer: manufacturer ? manufacturer.trim() : 'ArogyaX Pharma',
      medicineType: medicineType || 'Tablet',
      strength: strength || '500mg',
      composition: Array.isArray(composition) ? composition : [medicineName.trim()],
      category: category || 'General',
      scheduleType: scheduleType || 'OTC',
      requiresPrescription: requiresPrescription !== undefined ? Boolean(requiresPrescription) : true,
      availableStrengths: Array.isArray(availableStrengths) ? availableStrengths : [strength || '500mg'],
      availablePackSizes: Array.isArray(availablePackSizes) ? availablePackSizes : ['10 Tablets'],
      defaultInstructions: defaultInstructions || 'Take as directed by practitioner.',
      commonSideEffects: Array.isArray(commonSideEffects) ? commonSideEffects : [],
      contraindications: Array.isArray(contraindications) ? contraindications : [],
      storageInstructions: storageInstructions || 'Store in a cool, dry place away from direct sunlight.',
      pregnancyCategory: pregnancyCategory || 'B',
      childSafe: childSafe !== undefined ? Boolean(childSafe) : true,
      seniorSafe: seniorSafe !== undefined ? Boolean(seniorSafe) : true,
      status: 'active',
      isDeleted: false
    });

    await medicine.save();

    return reply.code(201).send({
      success: true,
      message: 'Medicine entry added to Master Catalog successfully!',
      medicine
    });
  } catch (err) {
    console.error('createMedicine error:', err);
    return reply.code(500).send({ error: 'Failed to create medicine.', details: err.message });
  }
};

// 2. Get All Medicines (Paginated Catalog Search for Admin & Doctors)
exports.getAllMedicines = async (request, reply) => {
  try {
    await ensureSeededCatalog();

    const page = parseInt(request.query.page, 10) || 1;
    const limit = parseInt(request.query.limit, 10) || 20;
    const search = request.query.search || '';
    const category = request.query.category || '';
    const scheduleType = request.query.scheduleType || '';

    const filter = { isDeleted: { $ne: true } };

    if (search.trim()) {
      filter.$or = [
        { medicineName: { $regex: search.trim(), $options: 'i' } },
        { genericName: { $regex: search.trim(), $options: 'i' } },
        { brandName: { $regex: search.trim(), $options: 'i' } },
        { manufacturer: { $regex: search.trim(), $options: 'i' } },
        { category: { $regex: search.trim(), $options: 'i' } }
      ];
    }
    if (category.trim()) filter.category = category.trim();
    if (scheduleType.trim()) filter.scheduleType = scheduleType.trim();

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

// 3. Fast Autocomplete Search by Brand, Generic, Composition, Category, Manufacturer
exports.searchMedicines = async (request, reply) => {
  try {
    const q = (request.query.q || request.query.search || '').trim();
    if (!q) {
      const topMeds = await Medicine.find({ isDeleted: { $ne: true } }).limit(20).lean();
      return reply.send({ success: true, data: topMeds });
    }

    const filter = {
      isDeleted: { $ne: true },
      $or: [
        { medicineName: { $regex: q, $options: 'i' } },
        { genericName: { $regex: q, $options: 'i' } },
        { brandName: { $regex: q, $options: 'i' } },
        { composition: { $regex: q, $options: 'i' } },
        { manufacturer: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ]
    };

    const results = await Medicine.find(filter).limit(30).lean();
    return reply.send({ success: true, data: results });
  } catch (err) {
    console.error('searchMedicines error:', err);
    return reply.code(500).send({ error: 'Failed to perform medicine search.', details: err.message });
  }
};

// 4. Get Single Medicine by ID
exports.getMedicineById = async (request, reply) => {
  try {
    const medicine = await Medicine.findOne({ _id: request.params.id, isDeleted: { $ne: true } });
    if (!medicine) {
      return reply.code(404).send({ error: 'Medicine record not found.' });
    }
    return reply.send({ success: true, medicine });
  } catch (err) {
    console.error('getMedicineById error:', err);
    return reply.code(500).send({ error: 'Failed to retrieve medicine details.', details: err.message });
  }
};

// 5. Update Medicine Entry (Admin Only)
exports.updateMedicine = async (request, reply) => {
  try {
    const { id } = request.params;
    const medicine = await Medicine.findOne({ _id: id, isDeleted: { $ne: true } });

    if (!medicine) {
      return reply.code(404).send({ error: 'Medicine record not found.' });
    }

    Object.assign(medicine, request.body || {});
    await medicine.save();

    return reply.send({
      success: true,
      message: 'Master Medicine Catalog record updated successfully.',
      medicine
    });
  } catch (err) {
    console.error('updateMedicine error:', err);
    return reply.code(500).send({ error: 'Failed to update medicine record.', details: err.message });
  }
};

// 6. Soft Delete Medicine Entry (Admin Only)
exports.deleteMedicine = async (request, reply) => {
  try {
    const { id } = request.params;
    const medicine = await Medicine.findById(id);

    if (!medicine) {
      return reply.code(404).send({ error: 'Medicine record not found.' });
    }

    medicine.isDeleted = true;
    medicine.deletedAt = new Date();
    await medicine.save();

    return reply.send({
      success: true,
      message: `Medicine "${medicine.medicineName}" soft-deleted successfully.`
    });
  } catch (err) {
    console.error('deleteMedicine error:', err);
    return reply.code(500).send({ error: 'Failed to delete medicine.', details: err.message });
  }
};

// 7. Seed Catalog
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
    const total = await Medicine.countDocuments({ isDeleted: { $ne: true } });
    return reply.send({
      success: true,
      message: `Master Medicine Catalog initialized!`,
      newRecordsInserted: insertedCount,
      totalCatalogSize: total
    });
  } catch (err) {
    console.error('seedMedicines error:', err);
    return reply.code(500).send({ error: 'Failed to seed medicine catalog.', details: err.message });
  }
};
