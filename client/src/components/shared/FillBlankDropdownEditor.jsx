import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Type, List } from 'lucide-react';

const FillBlankDropdownEditor = ({ value, onChange }) => {
    // value is expected to be { segments: [] }
    const [segments, setSegments] = useState(value?.segments || []);
    const [error, setError] = useState(null);

    useEffect(() => {
        setSegments(value?.segments || []);
    }, [value?.segments]);

    const handleSegmentsChange = (newSegments) => {
        setSegments(newSegments);
        onChange({ segments: newSegments });
    };

    const generateId = (prefix) => `${prefix}_${Math.random().toString(36).substr(2, 9)}`;

    const addTextSegment = () => {
        const newSegments = [...segments, { id: generateId('t'), type: 'text', value: '' }];
        handleSegmentsChange(newSegments);
    };

    const addBlankSegment = () => {
        const newSegments = [...segments, { id: generateId('b'), type: 'blank', options: ['', ''], correctIndex: 0 }];
        handleSegmentsChange(newSegments);
    };

    const removeSegment = (index) => {
        const newSegments = segments.filter((_, i) => i !== index);
        handleSegmentsChange(newSegments);
    };

    const updateTextSegment = (index, newValue) => {
        const newSegments = [...segments];
        newSegments[index].value = newValue;
        handleSegmentsChange(newSegments);
    };

    const updateBlankOption = (segmentIndex, optionIndex, newValue) => {
        const newSegments = [...segments];
        newSegments[segmentIndex].options[optionIndex] = newValue;
        handleSegmentsChange(newSegments);
    };

    const addBlankOption = (segmentIndex) => {
        const newSegments = [...segments];
        newSegments[segmentIndex].options.push('');
        handleSegmentsChange(newSegments);
    };

    const removeBlankOption = (segmentIndex, optionIndex) => {
        const newSegments = [...segments];
        if (newSegments[segmentIndex].options.length <= 2) {
            setError('A blank must have at least 2 options.');
            return;
        }
        
        newSegments[segmentIndex].options.splice(optionIndex, 1);
        
        if (newSegments[segmentIndex].correctIndex === optionIndex) {
            newSegments[segmentIndex].correctIndex = 0;
        } else if (newSegments[segmentIndex].correctIndex > optionIndex) {
            newSegments[segmentIndex].correctIndex -= 1;
        }

        handleSegmentsChange(newSegments);
        setError(null);
    };

    const setCorrectOption = (segmentIndex, optionIndex) => {
        const newSegments = [...segments];
        newSegments[segmentIndex].correctIndex = optionIndex;
        handleSegmentsChange(newSegments);
    };

    const moveSegment = (index, direction) => {
        if (direction === -1 && index === 0) return;
        if (direction === 1 && index === segments.length - 1) return;

        const newSegments = [...segments];
        const temp = newSegments[index];
        newSegments[index] = newSegments[index + direction];
        newSegments[index + direction] = temp;
        handleSegmentsChange(newSegments);
    };

    const renderPreview = () => {
        if (!segments || segments.length === 0) return <span className="text-gray-400 italic">No content yet. Add text and blanks to build your passage.</span>;
        
        return segments.map((seg) => {
            if (seg.type === 'text') {
                // preserve whitespace by rendering inside a span with white-space: pre-wrap
                return <span key={seg.id} style={{ whiteSpace: 'pre-wrap' }}>{seg.value}</span>;
            } else if (seg.type === 'blank') {
                return (
                    <select key={seg.id} className="mx-1 px-2 py-1 bg-white border border-gray-300 rounded text-sm inline-block max-w-xs align-middle truncate">
                        <option value="">— choose —</option>
                        {seg.options.map((opt, i) => (
                            <option key={i} value={opt}>{opt || '(empty option)'}</option>
                        ))}
                    </select>
                );
            }
            return null;
        });
    };

    // Auto-clear error when user fixes it
    useEffect(() => {
        if (error) {
            const hasInvalidBlank = segments.some(s => s.type === 'blank' && s.options.length < 2);
            if (!hasInvalidBlank) setError(null);
        }
    }, [segments, error]);

    return (
        <div className="space-y-6 md:col-span-2 p-1">
            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4">
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">
                        Passage Structure
                    </label>
                    <span className="text-xs text-gray-500">
                        Build your passage by mixing Text and Blank blocks.
                    </span>
                </div>

                <div className="space-y-3">
                    {segments.map((segment, index) => (
                        <div key={segment.id} className={`flex gap-3 items-start p-3 border rounded-lg bg-white shadow-sm transition-all ${segment.type === 'blank' ? 'border-indigo-200' : 'border-gray-200'}`}>
                            {/* Controls */}
                            <div className="flex flex-col gap-1 items-center pt-1 text-gray-400">
                                <button 
                                    type="button" 
                                    onClick={() => moveSegment(index, -1)} 
                                    disabled={index === 0}
                                    className="hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                                >
                                    ▲
                                </button>
                                <GripVertical className="w-4 h-4 text-gray-300" />
                                <button 
                                    type="button" 
                                    onClick={() => moveSegment(index, 1)} 
                                    disabled={index === segments.length - 1}
                                    className="hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                                >
                                    ▼
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-xs font-semibold px-2 py-1 rounded uppercase tracking-wider ${segment.type === 'text' ? 'bg-gray-100 text-gray-600' : 'bg-indigo-100 text-indigo-700'}`}>
                                        {segment.type === 'text' ? 'Text Block' : 'Dropdown Blank'}
                                    </span>
                                </div>

                                {segment.type === 'text' ? (
                                    <textarea
                                        value={segment.value}
                                        onChange={(e) => updateTextSegment(index, e.target.value)}
                                        rows={2}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:border-indigo-400 focus:bg-white focus:outline-none transition-colors resize-y"
                                        placeholder="Type passage text here..."
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        {segment.options.map((opt, optIndex) => (
                                            <div key={optIndex} className="flex gap-2 items-start">
                                                <div className="pt-2">
                                                    <input
                                                        type="radio"
                                                        name={`correct_${segment.id}`}
                                                        checked={segment.correctIndex === optIndex}
                                                        onChange={() => setCorrectOption(index, optIndex)}
                                                        className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                                        title="Mark as correct answer"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <textarea
                                                        value={opt}
                                                        onChange={(e) => updateBlankOption(index, optIndex, e.target.value)}
                                                        rows={1}
                                                        className={`w-full px-3 py-2 text-sm bg-gray-50 border rounded focus:outline-none focus:bg-white resize-y ${segment.correctIndex === optIndex ? 'border-green-400 focus:border-green-500' : 'border-gray-200 focus:border-indigo-400'}`}
                                                        placeholder={`Option ${optIndex + 1}`}
                                                        style={{ minHeight: '38px' }}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeBlankOption(index, optIndex)}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                                                    title="Remove option"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => addBlankOption(index)}
                                            className="mt-1 text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors"
                                        >
                                            <Plus className="w-4 h-4" /> Add Option
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Delete block */}
                            <button
                                type="button"
                                onClick={() => removeSegment(index)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors flex-shrink-0 mt-6"
                                title="Remove entire block"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 pt-2 border-t border-gray-100 mt-4">
                    <button
                        type="button"
                        onClick={addTextSegment}
                        className="flex-1 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:text-gray-800 transition-colors text-sm font-medium text-gray-600 flex items-center justify-center gap-2"
                    >
                        <Type className="w-4 h-4" /> Add Text
                    </button>
                    <button
                        type="button"
                        onClick={addBlankSegment}
                        className="flex-1 py-3 border-2 border-dashed border-indigo-200 bg-indigo-50/50 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-800 transition-colors text-sm font-medium text-indigo-600 flex items-center justify-center gap-2"
                    >
                        <List className="w-4 h-4" /> Add Dropdown Blank
                    </button>
                </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Live Preview</h4>
                <div className="text-lg leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {renderPreview()}
                </div>
            </div>
        </div>
    );
};

export default FillBlankDropdownEditor;
