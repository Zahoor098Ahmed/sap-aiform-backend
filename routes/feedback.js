const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Feedback = require('../models/Feedback');

// JSON File Storage Setup
const dataFilePath = path.join(__dirname, '..', 'data', 'feedback.json');

// Helper functions for JSON storage
const readFeedbackData = () => {
  try {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading feedback data:', error);
    return [];
  }
};

const writeFeedbackData = (data) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing feedback data:', error);
    return false;
  }
};

// Submit feedback
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, jobTitle, companyName, topic, reason } = req.body;
    
    // Validation
    if (!name || !email || !jobTitle || !companyName || !topic) {
      return res.status(400).json({
        error: 'Missing required fields: name, email, jobTitle, companyName, topic'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }
    
    const feedbackData = {
      id: Date.now().toString(),
      name,
      email,
      phone,
      jobTitle,
      companyName,
      topic,
      reason,
      submittedAt: new Date().toISOString(),
      ipAddress: req.ip || req.connection.remoteAddress
    };
    
    // Try MongoDB first, fallback to JSON
    const mongoConnected = mongoose.connection.readyState === 1;
    if (mongoConnected) {
      try {
        const feedback = new Feedback(feedbackData);
        await feedback.save();
        
        res.status(201).json({
          message: 'Feedback submitted successfully',
          id: feedback._id
        });
        return;
      } catch (mongoError) {
        console.error('MongoDB save error, falling back to JSON:', mongoError.message);
      }
    }
    
    // JSON storage fallback
    const allFeedback = readFeedbackData();
    allFeedback.push(feedbackData);
    
    if (writeFeedbackData(allFeedback)) {
      res.status(201).json({
        message: 'Feedback submitted successfully',
        id: feedbackData.id
      });
    } else {
      throw new Error('Failed to save feedback data');
    }
    
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;