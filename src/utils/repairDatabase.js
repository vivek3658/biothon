const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const dbConnector = require('../config/db');
const Account = require('../models/Account');
const User = require('../models/User');
const Organization = require('../models/Organization');

async function runRepair() {
  console.log('🔄 Connecting to MongoDB for account cleanup...');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/arogyax';
  await mongoose.connect(mongoUri);

  console.log('⚡ Repairing user accounts in database...');
  const allUsers = await User.find();
  let repairedCount = 0;

  for (const u of allUsers) {
    if (u.accountId) {
      const acc = await Account.findById(u.accountId);
      if (acc) {
        let changed = false;
        if (acc.entityModel !== 'User') {
          acc.entityModel = 'User';
          changed = true;
        }
        const targetRole = u.isDoctor ? 'doctor' : 'patient';
        if (acc.role !== targetRole) {
          acc.role = targetRole;
          changed = true;
        }
        if (acc.entityId?.toString() !== u._id.toString()) {
          acc.entityId = u._id;
          changed = true;
        }
        if (changed) {
          await acc.save();
          repairedCount++;
          console.log(`✅ Repaired account ${acc.email} -> entityModel: User, role: ${acc.role}`);
        }

        // Delete any erroneously created Organization profiles for this user account
        const deletedOrgs = await Organization.deleteMany({ accountId: acc._id });
        if (deletedOrgs.deletedCount > 0) {
          console.log(`🧹 Removed ${deletedOrgs.deletedCount} stray Organization profile(s) for ${acc.email}`);
        }
      }
    }
  }

  console.log(`🎉 Account repair complete! ${repairedCount} account(s) restored.`);
  process.exit(0);
}

runRepair().catch(err => {
  console.error('Repair error:', err);
  process.exit(1);
});
