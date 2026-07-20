const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const PharmacyInventory = require('../models/PharmacyInventory');
const Medicine = require('../models/Medicine');
const MedicineOrder = require('../models/MedicineOrder');
const Prescription = require('../models/Prescription');
const User = require('../models/User');

const resolveOrganization = async ({ accountId, entityId }) => {
  if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
    const organization = await Organization.findById(entityId);
    if (organization) return organization;
  }
  if (accountId) return Organization.findOne({ accountId });
  return null;
};

const resolveUser = async ({ accountId, entityId }) => {
  if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
    const user = await User.findById(entityId);
    if (user) return user;
  }
  if (accountId) return User.findOne({ accountId });
  return null;
};

exports.upsertInventoryItem = async (request, reply) => {
  try {
    const organization = await resolveOrganization(request.user || {});
    if (!organization || organization.facilityType !== 'pharmacy') return reply.code(403).send({ error: 'Only pharmacy organizations can manage inventory.' });

    const { medicineId, companyName, price, stock, isActive = true } = request.body || {};
    if (!medicineId || !mongoose.Types.ObjectId.isValid(medicineId)) return reply.code(400).send({ error: 'Valid medicineId is required.' });
    if (!companyName?.trim()) return reply.code(400).send({ error: 'companyName is required.' });

    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return reply.code(404).send({ error: 'Medicine not found.' });

    const item = await PharmacyInventory.findOneAndUpdate(
      { organizationId: organization._id, medicineId, companyName: companyName.trim() },
      { $set: { price: parseFloat(price) || 0, stock: parseInt(stock, 10) || 0, isActive: Boolean(isActive) } },
      { new: true, upsert: true, runValidators: true }
    );

    return reply.send({ success: true, item });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to update pharmacy inventory.', details: err.message });
  }
};

exports.getInventory = async (request, reply) => {
  try {
    const { organizationId, query = '' } = request.query || {};
    const filter = { isActive: true };
    if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) filter.organizationId = organizationId;

    let items = await PharmacyInventory.find(filter)
      .populate('organizationId', 'name facilityType location contactNumber')
      .populate('medicineId')
      .sort({ updatedAt: -1 })
      .lean();

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter((item) => (
        item.companyName?.toLowerCase().includes(q) ||
        item.medicineId?.medicineName?.toLowerCase().includes(q)
      ));
    }

    return reply.send({ success: true, items });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to fetch pharmacy inventory.', details: err.message });
  }
};

exports.getMarketplaceForPrescription = async (request, reply) => {
  try {
    const { prescriptionId } = request.params || {};
    if (!prescriptionId || !mongoose.Types.ObjectId.isValid(prescriptionId)) return reply.code(400).send({ error: 'Invalid prescriptionId.' });

    const prescription = await Prescription.findById(prescriptionId).lean();
    if (!prescription) return reply.code(404).send({ error: 'Prescription not found.' });

    const medicineNames = prescription.medications.map((medication) => medication.medicineName);
    const items = await PharmacyInventory.find({ isActive: true })
      .populate('organizationId', 'name facilityType location contactNumber')
      .populate('medicineId')
      .lean();

    const cart = items.filter((item) => medicineNames.some((medicineName) => medicineName.toLowerCase() === item.medicineId?.medicineName?.toLowerCase()));
    return reply.send({ success: true, prescription, items: cart });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to build marketplace cart.', details: err.message });
  }
};

exports.placeOrder = async (request, reply) => {
  try {
    const patient = await resolveUser(request.user || {});
    if (!patient) return reply.code(403).send({ error: 'Patient identity required.' });

    const { organizationId, prescriptionId, items = [] } = request.body || {};
    if (!organizationId || !mongoose.Types.ObjectId.isValid(organizationId)) return reply.code(400).send({ error: 'Valid organizationId is required.' });
    if (!Array.isArray(items) || !items.length) return reply.code(400).send({ error: 'At least one order item is required.' });

    const resolvedItems = [];
    let totalAmount = 0;
    for (const item of items) {
      if (!item.inventoryId || !mongoose.Types.ObjectId.isValid(item.inventoryId)) continue;
      const inventory = await PharmacyInventory.findById(item.inventoryId).populate('medicineId');
      if (!inventory) continue;
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      resolvedItems.push({
        inventoryId: inventory._id,
        medicineId: inventory.medicineId._id,
        medicineName: inventory.medicineId.medicineName,
        companyName: inventory.companyName,
        quantity,
        price: inventory.price
      });
      totalAmount += inventory.price * quantity;
    }
    if (!resolvedItems.length) return reply.code(400).send({ error: 'No valid inventory items were selected.' });

    const order = await MedicineOrder.create({
      patientId: patient._id,
      organizationId,
      prescriptionId: prescriptionId && mongoose.Types.ObjectId.isValid(prescriptionId) ? prescriptionId : null,
      items: resolvedItems,
      totalAmount
    });

    return reply.code(201).send({ success: true, order });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to place medicine order.', details: err.message });
  }
};

exports.getOrders = async (request, reply) => {
  try {
    const organization = await resolveOrganization(request.user || {});
    const user = await resolveUser(request.user || {});
    const filter = {};
    if (organization) filter.organizationId = organization._id;
    else if (user) filter.patientId = user._id;
    else if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'No order identity found.' });

    const orders = await MedicineOrder.find(filter)
      .populate('patientId', 'name bloodGroup location')
      .populate('organizationId', 'name facilityType')
      .populate('prescriptionId')
      .sort({ createdAt: -1 })
      .lean();

    return reply.send({ success: true, orders });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to fetch medicine orders.', details: err.message });
  }
};

exports.updateOrderStatus = async (request, reply) => {
  try {
    const { orderId } = request.params || {};
    const { status } = request.body || {};
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) return reply.code(400).send({ error: 'Invalid orderId.' });
    if (!['pending', 'confirmed', 'packed', 'completed', 'cancelled'].includes(status)) return reply.code(400).send({ error: 'Invalid order status.' });

    const organization = await resolveOrganization(request.user || {});
    const order = await MedicineOrder.findById(orderId);
    if (!order) return reply.code(404).send({ error: 'Order not found.' });
    if (!organization || organization._id.toString() !== order.organizationId.toString()) return reply.code(403).send({ error: 'You do not have permission to update this order.' });

    order.status = status;
    await order.save();

    return reply.send({ success: true, order });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to update order status.', details: err.message });
  }
};
