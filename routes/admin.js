const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const QRCode = require('qrcode');
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

// Get all feedback (admin only)
router.get('/feedback', async (req, res) => {
  try {
    let feedback = [];
    
    // Try MongoDB first, fallback to JSON
    const mongoConnected = mongoose.connection.readyState === 1;
    if (mongoConnected) {
      try {
        feedback = await Feedback.find().sort({ submittedAt: -1 });
      } catch (mongoError) {
        console.error('MongoDB fetch error, falling back to JSON:', mongoError.message);
        feedback = readFeedbackData();
        feedback.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      }
    } else {
      feedback = readFeedbackData();
      feedback.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    }
    
    res.json(feedback);
    
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Export feedback to Excel (admin only)
router.get('/feedback/export', async (req, res) => {
  try {
    let feedback = [];
    
    // Try MongoDB first, fallback to JSON
    const mongoConnected = mongoose.connection.readyState === 1;
    if (mongoConnected) {
      try {
        feedback = await Feedback.find().sort({ submittedAt: -1 });
      } catch (mongoError) {
        console.error('MongoDB fetch error, falling back to JSON:', mongoError.message);
        feedback = readFeedbackData();
        feedback.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      }
    } else {
      feedback = readFeedbackData();
      feedback.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    }
    
    // Prepare data for Excel
    const excelData = feedback.map(item => ({
      'Name': item.name,
      'Email': item.email,
      'Phone': item.phone || 'N/A',
      'Job Title': item.jobTitle,
      'Company Name': item.companyName,
      'Topic of Interest': item.topic,
      'Reason for Contact': item.reason || 'N/A',
      'Submitted At': new Date(item.submittedAt).toLocaleString(),
      'IP Address': item.ipAddress || 'N/A'
    }));
    
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Feedback Data');
    
    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=feedback-export-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    res.send(excelBuffer);
    
  } catch (error) {
    console.error('Error exporting feedback:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Generate QR code (admin only)
router.get('/qrcode', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL parameter is required'
      });
    }
    
    const qrCodeDataURL = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    res.json({ qrCode: qrCodeDataURL });
    
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      error: 'Failed to generate QR code'
    });
  }
});

// Generate QR code with custom options (admin only)
router.post('/qrcode', async (req, res) => {
  try {
    const { url, options = {} } = req.body;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL is required'
      });
    }
    
    const qrOptions = {
      width: options.width || 300,
      margin: options.margin || 2,
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF'
      }
    };
    
    const qrCodeDataURL = await QRCode.toDataURL(url, qrOptions);
    
    res.json({ qrCode: qrCodeDataURL });
    
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      error: 'Failed to generate QR code'
    });
  }
});

// Delete feedback (admin only)
router.delete('/feedback/:id', async (req, res) => {
  try {
    const { id: feedbackId } = req.params;
    
    if (!feedbackId) {
      return res.status(400).json({
        error: 'Feedback ID is required'
      });
    }
    
    // Try MongoDB first, fallback to JSON
    const mongoConnected = mongoose.connection.readyState === 1;
    if (mongoConnected) {
      try {
        const deletedFeedback = await Feedback.findByIdAndDelete(feedbackId);
        
        if (!deletedFeedback) {
          return res.status(404).json({
            error: 'Feedback not found'
          });
        }
        
        res.json({
          message: 'Feedback deleted successfully',
          id: feedbackId
        });
        return;
      } catch (mongoError) {
        console.error('MongoDB delete error, falling back to JSON:', mongoError.message);
      }
    }
    
    // JSON storage fallback
    const allFeedback = readFeedbackData();
    // Check both id and _id fields for compatibility
    const feedbackIndex = allFeedback.findIndex(item => item.id === feedbackId || item._id === feedbackId);
    
    if (feedbackIndex === -1) {
      return res.status(404).json({
        error: 'Feedback not found'
      });
    }
    
    // Remove feedback from array
    allFeedback.splice(feedbackIndex, 1);
    
    if (writeFeedbackData(allFeedback)) {
      res.json({
        message: 'Feedback deleted successfully',
        id: feedbackId
      });
    } else {
      throw new Error('Failed to delete feedback data');
    }
    
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get feedback statistics (admin only)
router.get('/feedback/stats', async (req, res) => {
  try {
    let feedback = [];
    
    // Try MongoDB first, fallback to JSON
    const mongoConnected = mongoose.connection.readyState === 1;
    if (mongoConnected) {
      try {
        const totalFeedback = await Feedback.countDocuments();
        
        const topicStats = await Feedback.aggregate([
          {
            $group: {
              _id: '$topic',
              count: { $sum: 1 }
            }
          }
        ]);
        
        const recentFeedback = await Feedback.find()
          .sort({ submittedAt: -1 })
          .limit(5)
          .select('name email topic submittedAt');
        
        res.json({
          total: totalFeedback,
          topicBreakdown: topicStats,
          recent: recentFeedback
        });
        return;
      } catch (mongoError) {
        console.error('MongoDB stats error, falling back to JSON:', mongoError.message);
      }
    }
    
    // JSON storage fallback
    feedback = readFeedbackData();
    
    const totalFeedback = feedback.length;
    
    // Calculate topic breakdown
    const topicCounts = {};
    feedback.forEach(item => {
      topicCounts[item.topic] = (topicCounts[item.topic] || 0) + 1;
    });
    
    const topicStats = Object.entries(topicCounts).map(([topic, count]) => ({
      _id: topic,
      count
    }));
    
    // Get recent feedback
    const recentFeedback = feedback
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, 5)
      .map(item => ({
        name: item.name,
        email: item.email,
        topic: item.topic,
        submittedAt: item.submittedAt
      }));
    
    res.json({
      total: totalFeedback,
      topicBreakdown: topicStats,
      recent: recentFeedback
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;