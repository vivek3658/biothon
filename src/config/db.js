// src/db.js
const fp = require('fastify-plugin');
const mongoose = require('mongoose');

const dbConnector = async (fastify, options) => {
  try {
    // Connect using the variable loaded by dotenv
    await mongoose.connect(process.env.MONGO_URI);
    
    // Share mongoose with the rest of the app
    fastify.decorate('mongoose', mongoose);
    console.log('MongoDB connected successfully!');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

module.exports = fp(dbConnector);