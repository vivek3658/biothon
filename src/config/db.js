// src/config/db.js
const fp = require('fastify-plugin');
const mongoose = require('mongoose');

const dbConnector = async (fastify, options) => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/arogyax';
    
    // Connect to MongoDB with connection timeouts
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000
    });
    
    // Share mongoose with fastify instance
    fastify.decorate('mongoose', mongoose);
    console.log('MongoDB connected successfully!');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

module.exports = fp(dbConnector);