const mongoose = require('mongoose');

const virtualLabSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['Physics', 'Math & Statistics', 'Chemistry', 'Earth & Space', 'Biology'],
    },
    subcategory: {
      type: String,
      enum: [
        'Motion', 'Sound & Waves', 'Work, Energy & Power', 'Heat & Thermo', 'Quantum Phenomena', 'Light & Radiation', 'Electricity, Magnets & Circuits',
        'Math Concepts', 'Math Applications',
        'General Chemistry', 'Quantum Chemistry',
        '', null
      ],
    },
    fileName: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
    },
    fileSize: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('VirtualLab', virtualLabSchema);
