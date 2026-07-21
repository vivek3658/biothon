// src/config/db.js
const fp = require('fastify-plugin');
const mongoose = require('mongoose');

const dbConnector = async (fastify, options) => {
  try {
    // Reuse existing active connection in serverless environment
    if (mongoose.connection.readyState >= 1) {
      if (!fastify.hasDecorator('mongoose')) {
        fastify.decorate('mongoose', mongoose);
      }
      return;
    }

    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/arogyax';
    
    // Connect to MongoDB
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000
    });
    
    if (!fastify.hasDecorator('mongoose')) {
      fastify.decorate('mongoose', mongoose);
    }
    console.log('MongoDB connected successfully!');
  } catch (error) {
    console.error('Database connection failed:', error.message);
    throw new Error(`Database connection failed: ${error.message}. Please configure MONGO_URI in Vercel project environment variables.`);
  }
};

module.exports = fp(dbConnector);