import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, X, Loader2, FlaskConical, FileText, Upload } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const VIRTUAL_LAB_CATEGORIES = [
  { name: 'Physics', subcategories: ['Motion', 'Sound & Waves', 'Work, Energy & Power', 'Heat & Thermo', 'Quantum Phenomena', 'Light & Radiation', 'Electricity, Magnets & Circuits'] },
  { name: 'Math & Statistics', subcategories: ['Math Concepts', 'Math Applications'] },
  { name: 'Chemistry', subcategories: ['General Chemistry', 'Quantum Chemistry'] },
  { name: 'Earth & Space', subcategories: [] },
  { name: 'Biology', subcategories: [] },
];

const VirtualLabsManager = () => {
  const { t, isRTL } = useLanguage();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLab, setEditingLab] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    subcategory: '',
  });
  const [file, setFile] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    fetchLabs();
  }, []);

  const fetchLabs = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/virtual-labs');
      setLabs(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load virtual labs');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (lab = null) => {
    setEditingLab(lab);
    if (lab) {
      setFormData({
        title: lab.title,
        description: lab.description || '',
        category: lab.category,
        subcategory: lab.subcategory || '',
      });
    } else {
      setFormData({
        title: '',
        description: '',
        category: '',
        subcategory: '',
      });
    }
    setFile(null);
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingLab(null);
    setFormData({ title: '', description: '', category: '', subcategory: '' });
    setFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!editingLab && !file) {
      setError('An HTML file is required for new virtual labs.');
      return;
    }

    setFormLoading(true);
    setError('');
    
    const data = new FormData();
    data.append('title', formData.title);
    data.append('description', formData.description);
    data.append('category', formData.category);
    if (formData.subcategory) {
      data.append('subcategory', formData.subcategory);
    }
    if (file) {
      data.append('labFile', file);
    }

    try {
      if (editingLab) {
        await axios.put(`/api/virtual-labs/${editingLab._id}`, data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setSuccess('Virtual lab updated successfully');
      } else {
        await axios.post('/api/virtual-labs', data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setSuccess('Virtual lab created successfully');
      }
      fetchLabs();
      closeModal();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save virtual lab');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this virtual lab?')) {
      try {
        await axios.delete(`/api/virtual-labs/${id}`);
        setSuccess('Virtual lab deleted successfully');
        fetchLabs();
        setTimeout(() => setSuccess(''), 3000);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to delete virtual lab');
      }
    }
  };

  // Derive available subcategories based on selected category
  const selectedCategoryObj = VIRTUAL_LAB_CATEGORIES.find(c => c.name === formData.category);
  const availableSubcategories = selectedCategoryObj ? selectedCategoryObj.subcategories : [];

  return (
    <div className="bg-surface-light rounded-xl shadow-sm border border-border-light p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main-light">{t.virtualLabsManager || 'Virtual Labs Manager'}</h2>
            <p className="text-sm text-text-muted-light">Manage interactive HTML virtual labs for teachers.</p>
          </div>
        </div>
        
        <button
          onClick={() => openModal()}
          className="flex items-center space-x-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{t.add || 'Add Lab'}</span>
        </button>
      </div>

      {error && !isModalOpen && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-100">
          {error}
        </div>
      )}

      {success && !isModalOpen && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6 border border-green-100">
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : labs.length === 0 ? (
        <div className="text-center py-12 bg-background-light rounded-lg border border-dashed border-border-light">
          <FlaskConical className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-text-muted-light mb-4">No virtual labs have been uploaded yet.</p>
          <button onClick={() => openModal()} className="text-primary font-medium hover:underline">
            Upload your first lab
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background-light border-b border-gray-100 text-gray-600 text-sm">
                <th className="p-3 font-semibold rounded-tl-lg">Title</th>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">File</th>
                <th className="p-3 font-semibold rounded-tr-lg w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {labs.map(lab => (
                <tr key={lab._id} className="hover:bg-background-light transition-colors">
                  <td className="p-3">
                    <div className="font-medium text-text-main-light">{lab.title}</div>
                    {lab.description && (
                      <div className="text-xs text-text-muted-light truncate max-w-xs">{lab.description}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                      {lab.category}
                    </div>
                    {lab.subcategory && (
                      <div className="inline-flex items-center px-2 py-1 rounded text-xs text-text-muted-light bg-gray-100 ml-2">
                        {lab.subcategory}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-sm text-text-muted-light">
                    <div className="flex items-center space-x-1" title={lab.originalName}>
                      <FileText className="w-4 h-4" />
                      <span className="truncate max-w-[150px]">{lab.originalName || lab.fileName}</span>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => openModal(lab)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(lab._id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-text-main-light">
                {editingLab ? 'Edit Virtual Lab' : 'Upload Virtual Lab'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="E.g., Pendulum Lab"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  required
                  value={formData.category}
                  onChange={e => {
                    setFormData({ ...formData, category: e.target.value, subcategory: '' });
                  }}
                  className="w-full px-3 py-2 border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a category</option>
                  {VIRTUAL_LAB_CATEGORIES.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {availableSubcategories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                  <select
                    value={formData.subcategory}
                    onChange={e => setFormData({ ...formData, subcategory: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">None / General</option>
                    {availableSubcategories.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows="3"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Brief description of the experiment..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HTML File {editingLab ? '(Optional, upload to replace)' : '*'}
                </label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-medium">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-400">Standalone HTML file only (Max 20MB)</p>
                      {file && <p className="mt-2 text-sm font-medium text-primary text-center truncate max-w-[250px]">{file.name}</p>}
                      {!file && editingLab && <p className="mt-2 text-sm font-medium text-gray-500 truncate">Current: {editingLab.originalName}</p>}
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".html,text/html"
                      onChange={e => setFile(e.target.files[0])}
                      required={!editingLab}
                    />
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 text-white bg-primary hover:bg-primary-dark rounded-lg font-medium transition-colors flex items-center"
                >
                  {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingLab ? 'Save Changes' : 'Upload Lab'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VirtualLabsManager;
