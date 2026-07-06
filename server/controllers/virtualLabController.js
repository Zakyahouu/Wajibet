const asyncHandler = require('express-async-handler');
const VirtualLab = require('../models/VirtualLab');
const fs = require('fs');
const path = require('path');

// @desc    Get all virtual labs
// @route   GET /api/virtual-labs
// @access  Private
const getAllVirtualLabs = asyncHandler(async (req, res) => {
  const { category, subcategory } = req.query;
  const filter = {};
  
  if (category) filter.category = category;
  if (subcategory) filter.subcategory = subcategory;

  const labs = await VirtualLab.find(filter).sort({ category: 1, title: 1 });
  res.json(labs);
});

// @desc    Get single virtual lab
// @route   GET /api/virtual-labs/:id
// @access  Private
const getVirtualLabById = asyncHandler(async (req, res) => {
  const lab = await VirtualLab.findById(req.params.id);

  if (lab) {
    res.json(lab);
  } else {
    res.status(404);
    throw new Error('Virtual lab not found');
  }
});

// @desc    Create a virtual lab
// @route   POST /api/virtual-labs
// @access  Private/Admin
const createVirtualLab = asyncHandler(async (req, res) => {
  const { title, description, category, subcategory } = req.body;

  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  const lab = await VirtualLab.create({
    title,
    description,
    category,
    subcategory,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    fileSize: req.file.size,
  });

  res.status(201).json(lab);
});

// @desc    Update a virtual lab
// @route   PUT /api/virtual-labs/:id
// @access  Private/Admin
const updateVirtualLab = asyncHandler(async (req, res) => {
  const { title, description, category, subcategory } = req.body;
  const lab = await VirtualLab.findById(req.params.id);

  if (!lab) {
    res.status(404);
    throw new Error('Virtual lab not found');
  }

  lab.title = title || lab.title;
  lab.description = description || lab.description;
  lab.category = category || lab.category;
  lab.subcategory = subcategory !== undefined ? subcategory : lab.subcategory;

  if (req.file) {
    // Delete old file
    const oldFilePath = path.join(__dirname, '../public/virtual-labs/', lab.fileName);
    if (fs.existsSync(oldFilePath)) {
      fs.unlinkSync(oldFilePath);
    }

    lab.fileName = req.file.filename;
    lab.originalName = req.file.originalname;
    lab.fileSize = req.file.size;
  }

  const updatedLab = await lab.save();
  res.json(updatedLab);
});

// @desc    Delete a virtual lab
// @route   DELETE /api/virtual-labs/:id
// @access  Private/Admin
const deleteVirtualLab = asyncHandler(async (req, res) => {
  const lab = await VirtualLab.findById(req.params.id);

  if (!lab) {
    res.status(404);
    throw new Error('Virtual lab not found');
  }

  // Delete file
  const filePath = path.join(__dirname, '../public/virtual-labs/', lab.fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await lab.deleteOne();
  res.json({ message: 'Virtual lab removed' });
});

// @desc    Serve a virtual lab HTML file
// @route   GET /api/virtual-labs/file/:filename
// @access  Private
const getVirtualLabFile = asyncHandler(async (req, res) => {
  const filePath = path.join(__dirname, '../public/virtual-labs/', req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404);
    throw new Error('File not found');
  }
});

module.exports = {
  getAllVirtualLabs,
  getVirtualLabById,
  createVirtualLab,
  updateVirtualLab,
  deleteVirtualLab,
  getVirtualLabFile,
};
