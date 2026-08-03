import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const FillBlankDropdownEditor = ({ value, onChange }) => {
    const [passageText, setPassageText] = useState(value?.passageTemplate || '');
    const [blanks, setBlanks] = useState(value?.blanks || []);
    const [error, setError] = useState(null);

    // Sync internal state if prop changes externally (e.g. initial load)
    useEffect(() => {
        setPassageText(value?.passageTemplate || '');
        setBlanks(value?.blanks || []);
    }, [value?.passageTemplate, value?.blanks]);

    const handlePassageChange = (e) => {
        const newText = e.target.value;
        setPassageText(newText);
        onChange({ passageTemplate: newText, blanks });
    };

    const insertBlank = () => {
        const id = `b${Date.now()}`;
        const newText = passageText + (passageText.endsWith(' ') || passageText.length === 0 ? '' : ' ') + `[[${id}]]`;
        setPassageText(newText);
        // We do NOT auto-create the blank config here; the user must click "Detect Blanks"
        // to synchronize the config cards, as per instructions.
        onChange({ passageTemplate: newText, blanks });
    };

    const detectBlanks = () => {
        const regex = /\[\[(.*?)\]\]/g;
        let match;
        const detectedIds = new Set();
        while ((match = regex.exec(passageText)) !== null) {
            detectedIds.add(match[1]);
        }

        const newBlanks = [];
        const currentBlanksMap = new Map(blanks.map(b => [b.id, b]));
        
        let removedIds = [];
        for (const b of blanks) {
            if (!detectedIds.has(b.id)) {
                removedIds.push(b.id);
            }
        }

        if (removedIds.length > 0) {
            if (!window.confirm(`You removed the following blank tokens from the text: ${removedIds.join(', ')}.\nDo you want to delete their options?`)) {
                return; // Cancel detection
            }
        }

        detectedIds.forEach(id => {
            if (currentBlanksMap.has(id)) {
                newBlanks.push(currentBlanksMap.get(id));
            } else {
                newBlanks.push({
                    id: id,
                    options: ['', ''],
                    correctIndex: 0
                });
            }
        });

        setBlanks(newBlanks);
        onChange({ passageTemplate: passageText, blanks: newBlanks });
        setError(null);
    };

    const updateBlankOption = (blankIndex, optionIndex, newText) => {
        const newBlanks = [...blanks];
        newBlanks[blankIndex].options[optionIndex] = newText;
        setBlanks(newBlanks);
        onChange({ passageTemplate: passageText, blanks: newBlanks });
    };

    const addBlankOption = (blankIndex) => {
        const newBlanks = [...blanks];
        newBlanks[blankIndex].options.push('');
        setBlanks(newBlanks);
        onChange({ passageTemplate: passageText, blanks: newBlanks });
    };

    const removeBlankOption = (blankIndex, optionIndex) => {
        const newBlanks = [...blanks];
        if (newBlanks[blankIndex].options.length <= 2) {
            setError(`Blank '${newBlanks[blankIndex].id}' must have at least 2 options.`);
            return;
        }
        
        newBlanks[blankIndex].options.splice(optionIndex, 1);
        
        // Adjust correctIndex if needed
        if (newBlanks[blankIndex].correctIndex === optionIndex) {
            newBlanks[blankIndex].correctIndex = 0; // fallback
        } else if (newBlanks[blankIndex].correctIndex > optionIndex) {
            newBlanks[blankIndex].correctIndex -= 1;
        }

        setBlanks(newBlanks);
        onChange({ passageTemplate: passageText, blanks: newBlanks });
        setError(null);
    };

    const setCorrectOption = (blankIndex, optionIndex) => {
        const newBlanks = [...blanks];
        newBlanks[blankIndex].correctIndex = optionIndex;
        setBlanks(newBlanks);
        onChange({ passageTemplate: passageText, blanks: newBlanks });
    };

    const renderPreview = () => {
        if (!passageText) return <span className="text-gray-400 italic">No passage text</span>;
        
        const parts = passageText.split(/(\[\[.*?\]\])/g);
        return parts.map((part, index) => {
            const match = part.match(/\[\[(.*?)\]\]/);
            if (match) {
                const id = match[1];
                const blank = blanks.find(b => b.id === id);
                if (blank) {
                    return (
                        <select key={index} className="mx-1 px-2 py-1 bg-white border border-gray-300 rounded text-sm inline-block max-w-xs align-middle truncate">
                            <option value="">— choose —</option>
                            {blank.options.map((opt, i) => (
                                <option key={i} value={opt}>{opt || '(empty option)'}</option>
                            ))}
                        </select>
                    );
                } else {
                    return <span key={index} className="text-red-500 font-bold mx-1">[{id} (undefined)]</span>;
                }
            }
            return <span key={index}>{part}</span>;
        });
    };

    // Validation checks for rendering warnings
    const regex = /\[\[(.*?)\]\]/g;
    let match2;
    const currentTokens = new Set();
    while ((match2 = regex.exec(passageText)) !== null) {
        currentTokens.add(match2[1]);
    }
    
    const orphanedTokens = [...currentTokens].filter(id => !blanks.find(b => b.id === id));
    const orphanedBlanks = blanks.filter(b => !currentTokens.has(b.id));

    return (
        <div className="space-y-6 md:col-span-2 p-1">
            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4">
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}
            
            <div className="space-y-2">
                <div className="flex justify-between items-end">
                    <label className="block text-sm font-medium text-gray-700">
                        Passage / Sentence
                    </label>
                    <button 
                        type="button" 
                        onClick={insertBlank}
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded border border-gray-300 transition-colors"
                    >
                        + Insert Blank
                    </button>
                </div>
                <textarea
                    value={passageText}
                    onChange={handlePassageChange}
                    rows={4}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-md focus:border-indigo-400 focus:outline-none transition-colors resize-y"
                    placeholder="Enter a sentence or passage here. Use [[b1]], [[b2]] to indicate blanks."
                />
                
                <div className="flex justify-between items-center mt-2">
                    <div className="text-xs text-gray-500">
                        Use <code className="bg-gray-100 px-1 rounded">[[id]]</code> to mark blanks, e.g. <code className="bg-gray-100 px-1 rounded">I am [[b1]] happy.</code>
                    </div>
                    <button
                        type="button"
                        onClick={detectBlanks}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-md font-medium shadow-sm transition-colors"
                    >
                        Detect Blanks
                    </button>
                </div>
                
                {(orphanedTokens.length > 0 || orphanedBlanks.length > 0) && (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-md text-sm mt-2">
                        <strong>Warning:</strong> Passage and blanks are out of sync. Click "Detect Blanks" to update.
                    </div>
                )}
            </div>

            {blanks.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Blank Definitions</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {blanks.map((blank, blankIndex) => (
                            <div key={blank.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                                <div className="font-mono text-sm font-bold text-indigo-700 mb-3 pb-2 border-b border-gray-100">
                                    Blank {blank.id}
                                </div>
                                <div className="space-y-3">
                                    {blank.options.map((opt, optIndex) => (
                                        <div key={optIndex} className="flex gap-2 items-start">
                                            <div className="pt-2">
                                                <input
                                                    type="radio"
                                                    name={`correct_${blank.id}`}
                                                    checked={blank.correctIndex === optIndex}
                                                    onChange={() => setCorrectOption(blankIndex, optIndex)}
                                                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                                    title="Mark as correct answer"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <textarea
                                                    value={opt}
                                                    onChange={(e) => updateBlankOption(blankIndex, optIndex, e.target.value)}
                                                    rows={1}
                                                    className={`w-full px-3 py-2 text-sm bg-gray-50 border rounded focus:outline-none focus:bg-white resize-y ${blank.correctIndex === optIndex ? 'border-green-400 focus:border-green-500' : 'border-gray-200 focus:border-indigo-400'}`}
                                                    placeholder={`Option ${optIndex + 1}`}
                                                    style={{ minHeight: '38px' }}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeBlankOption(blankIndex, optIndex)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                title="Remove option"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => addBlankOption(blankIndex)}
                                    className="mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" /> Add Option
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Live Preview</h4>
                <div className="text-lg leading-relaxed text-gray-800">
                    {renderPreview()}
                </div>
            </div>
        </div>
    );
};

export default FillBlankDropdownEditor;
