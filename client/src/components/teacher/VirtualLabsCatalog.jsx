import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FlaskConical, Search, Play, Loader2, ChevronRight, Filter, X
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import VirtualLabViewer from './VirtualLabViewer';

const VIRTUAL_LAB_CATEGORIES = [
  { name: 'Physics', subcategories: ['Motion', 'Sound & Waves', 'Work, Energy & Power', 'Heat & Thermo', 'Quantum Phenomena', 'Light & Radiation', 'Electricity, Magnets & Circuits'] },
  { name: 'Math & Statistics', subcategories: ['Math Concepts', 'Math Applications'] },
  { name: 'Chemistry', subcategories: ['General Chemistry', 'Quantum Chemistry'] },
  { name: 'Earth & Space', subcategories: [] },
  { name: 'Biology', subcategories: [] },
];

const VirtualLabsCatalog = () => {
  const { t, isRTL } = useLanguage();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingLab, setViewingLab] = useState(null);

  // Fetch labs when filters change
  useEffect(() => {
    fetchLabs();
  }, [selectedCategory, selectedSubcategory]);

  const fetchLabs = async () => {
    setLoading(true);
    try {
      let url = '/api/virtual-labs';
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (selectedSubcategory) params.append('subcategory', selectedSubcategory);
      
      const queryString = params.toString();
      if (queryString) url += `?${queryString}`;

      const { data } = await axios.get(url);
      setLabs(data);
      setError('');
    } catch (err) {
      console.error('Failed to fetch labs:', err);
      setError(t.error || 'Failed to load virtual labs. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSearchQuery('');
  };

  // Client-side search filtering
  const filteredLabs = labs.filter(lab => 
    lab.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (lab.description && lab.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (viewingLab) {
    return <VirtualLabViewer lab={viewingLab} onBack={() => setViewingLab(null)} />;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[calc(100vh-140px)]">
      {/* Sidebar / Filter panel */}
      <div className="w-full lg:w-64 shrink-0">
        <div className="bg-surface-light rounded-xl shadow-sm border border-border-light p-4 sticky top-6">
          <div className="flex items-center space-x-2 mb-6">
            <Filter className="w-5 h-5 text-text-muted-light" />
            <h3 className="font-semibold text-text-main-light">{t.categories || 'Categories'}</h3>
          </div>

          <div className="space-y-1">
            <button
              onClick={clearFilters}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                !selectedCategory ? 'bg-primary/10 text-primary' : 'text-text-muted-light hover:bg-background-light'
              }`}
            >
              {t.allLabs || 'All Labs'}
            </button>

            {VIRTUAL_LAB_CATEGORIES.map(category => {
              const isSelected = selectedCategory === category.name;
              return (
                <div key={category.name} className="pt-1">
                  <button
                    onClick={() => {
                      setSelectedCategory(isSelected ? null : category.name);
                      setSelectedSubcategory(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isSelected ? 'bg-primary/10 text-primary' : 'text-text-muted-light hover:bg-background-light'
                    }`}
                  >
                    <span>{category.name}</span>
                    {category.subcategories.length > 0 && (
                      <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'rotate-90 text-primary' : 'text-gray-400'}`} />
                    )}
                  </button>

                  {/* Subcategories */}
                  {isSelected && category.subcategories.length > 0 && (
                    <div className="mt-1 ml-4 border-l-2 border-gray-100 pl-2 space-y-1">
                      {category.subcategories.map(sub => (
                        <button
                          key={sub}
                          onClick={() => setSelectedSubcategory(sub)}
                          className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                            selectedSubcategory === sub ? 'text-primary font-medium bg-primary/5' : 'text-text-muted-light hover:text-text-main-light hover:bg-background-light'
                          }`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search Bar */}
        <div className="bg-surface-light rounded-xl shadow-sm border border-border-light p-4 mb-6">
          <div className="relative max-w-xl">
            <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5`} />
            <input
              type="text"
              placeholder={t.search || 'Search virtual labs...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2.5 bg-background-light border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all`}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-text-muted-light`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Labs Grid */}
        <div className="flex-1">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-100 mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-text-muted-light">{t.loading || 'Loading labs...'}</p>
            </div>
          ) : filteredLabs.length === 0 ? (
            <div className="bg-surface-light rounded-xl border border-dashed border-border-light p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-background-light rounded-full flex items-center justify-center mb-4">
                <FlaskConical className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-text-main-light mb-2">{t.noResults || 'No Virtual Labs Found'}</h3>
              <p className="text-text-muted-light max-w-md">
                {searchQuery 
                  ? 'Try adjusting your search terms or clearing the filters.' 
                  : 'There are currently no virtual labs available in this category.'}
              </p>
              {searchQuery && (
                <button onClick={clearFilters} className="mt-4 text-primary hover:underline font-medium">
                  {t.clearFilters || 'Clear Filters'}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredLabs.map(lab => (
                <div key={lab._id} className="bg-surface-light rounded-xl border border-border-light hover:shadow-sm transition-all duration-200 overflow-hidden flex flex-col group">
                  <div className="h-32 bg-background-light flex items-center justify-center border-b border-border-light group-hover:bg-primary/5 transition-colors relative">
                    <FlaskConical className="w-12 h-12 text-gray-300 group-hover:text-primary/40 transition-colors" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-primary/10 text-primary px-2 py-1 rounded-md">
                        {lab.category}
                      </span>
                      {lab.subcategory && (
                        <span className="text-[10px] uppercase tracking-wider font-medium bg-background-light text-text-muted-light px-2 py-1 rounded-md">
                          {lab.subcategory}
                        </span>
                      )}
                    </div>
                    
                    <h4 className="font-semibold text-text-main-light text-lg mb-2 line-clamp-2">{lab.title}</h4>
                    <p className="text-sm text-text-muted-light line-clamp-3 mb-4 flex-1">
                      {lab.description || 'Interactive virtual lab experiment.'}
                    </p>
                    
                    <button
                      onClick={() => setViewingLab(lab)}
                      className="w-full mt-auto flex items-center justify-center space-x-2 bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg transition-colors font-medium shadow-sm hover:shadow group/btn"
                    >
                      <Play className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                      <span>{t.launch || 'Launch Lab'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VirtualLabsCatalog;
