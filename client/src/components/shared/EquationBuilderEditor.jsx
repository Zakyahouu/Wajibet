import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Trash2, HelpCircle, EyeOff, Eye, Check, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Converts a raw equation string e.g. "25 + [15] = 40" into an array of editable box items:
 * [{ id: '1', value: '25', isBlank: false }, { id: '2', value: '+', isBlank: false }, ...]
 */
const stringToBoxes = (eqStr) => {
    if (!eqStr || typeof eqStr !== 'string') {
        return [
            { id: 'b_1', value: '25', isBlank: false },
            { id: 'b_2', value: '+', isBlank: false },
            { id: 'b_3', value: '15', isBlank: true },
            { id: 'b_4', value: '=', isBlank: false },
            { id: 'b_5', value: '40', isBlank: false }
        ];
    }

    const boxes = [];
    const regex = /\[(.*?)\]|([^\s\[\]]+)/g;
    let match;
    let idx = 0;

    while ((match = regex.exec(eqStr)) !== null) {
        if (match[1] !== undefined) {
            // Bracketed term (Blank)
            boxes.push({
                id: 'box_' + (idx++),
                value: match[1].trim(),
                isBlank: true
            });
        } else if (match[2] !== undefined) {
            // Normal term
            boxes.push({
                id: 'box_' + (idx++),
                value: match[2].trim(),
                isBlank: false
            });
        }
    }

    return boxes.length > 0 ? boxes : [
        { id: 'box_0', value: '', isBlank: false }
    ];
};

/**
 * Converts an array of box objects back into the standardized equation string e.g. "25 + [15] = 40"
 */
const boxesToString = (boxes) => {
    return boxes
        .filter(b => b.value && b.value.trim() !== '')
        .map(b => b.isBlank ? `[${b.value.trim()}]` : b.value.trim())
        .join(' ');
};

const EquationBuilderEditor = ({ value, onChange }) => {
    const { t } = useLanguage();

    const initialEquation = typeof value === 'string'
        ? value
        : value?.equation || (Array.isArray(value?.segments)
            ? value.segments.map(s => s.type === 'blank' ? `[${s.options?.[s.correctIndex] || ''}]` : s.value).join(' ')
            : '25 + [15] = 40');

    const initialHint = typeof value === 'object' ? (value?.hint || '') : '';

    const [boxes, setBoxes] = useState(() => stringToBoxes(initialEquation));
    const [hint, setHint] = useState(initialHint);

    useEffect(() => {
        if (typeof value === 'string') {
            const currentStr = boxesToString(boxes);
            if (value !== currentStr) {
                setBoxes(stringToBoxes(value));
            }
        } else if (value && typeof value === 'object' && value.equation !== undefined) {
            const currentStr = boxesToString(boxes);
            if (value.equation !== currentStr) {
                setBoxes(stringToBoxes(value.equation));
            }
            if (value.hint !== undefined && value.hint !== hint) {
                setHint(value.hint || '');
            }
        }
    }, [value]);

    const emitChange = (updatedBoxes, updatedHint = hint) => {
        setBoxes(updatedBoxes);
        const eqStr = boxesToString(updatedBoxes);
        onChange({ equation: eqStr, hint: updatedHint });
    };

    const handleBoxValueChange = (id, newVal) => {
        const updated = boxes.map(b => b.id === id ? { ...b, value: newVal } : b);
        emitChange(updated);
    };

    const handleToggleBlank = (id) => {
        const updated = boxes.map(b => b.id === id ? { ...b, isBlank: !b.isBlank } : b);
        emitChange(updated);
    };

    const handleAddBox = (val = '', isBlank = false) => {
        const newBox = {
            id: 'box_' + Math.random().toString(36).substr(2, 9),
            value: val,
            isBlank: isBlank
        };
        const updated = [...boxes, newBox];
        emitChange(updated);
    };

    const handleRemoveBox = (id) => {
        if (boxes.length <= 1) {
            emitChange([{ id: 'box_0', value: '', isBlank: false }]);
            return;
        }
        const updated = boxes.filter(b => b.id !== id);
        emitChange(updated);
    };

    const handleQuickAddOperator = (op) => {
        handleAddBox(op, false);
    };

    const handleClearAll = () => {
        emitChange([
            { id: 'box_0', value: '', isBlank: false }
        ]);
    };

    const handleLoadTemplate = (tmplStr) => {
        emitChange(stringToBoxes(tmplStr));
    };

    const blankCount = boxes.filter(b => b.isBlank && b.value.trim() !== '').length;
    const equationString = boxesToString(boxes);

    return (
        <div className="space-y-5 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>{t?.mathEquationBuilder || 'Equation Field Boxes'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Put values in boxes, check <strong>"Hide"</strong> on terms you want students to solve for.</span>
                </div>
            </div>

            {/* Quick Templates */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-slate-400 font-medium">{t?.quickTemplates || 'Templates:'}</span>
                <button
                    type="button"
                    onClick={() => handleLoadTemplate('25 + [15] = 40')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    25 + [15] = 40
                </button>
                <button
                    type="button"
                    onClick={() => handleLoadTemplate('100 ÷ [4] = 25')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    100 ÷ [4] = 25
                </button>
                <button
                    type="button"
                    onClick={() => handleLoadTemplate('[12] × [8] = 96')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    [12] × [8] = 96
                </button>
                <button
                    type="button"
                    onClick={() => handleLoadTemplate('[3]x + 7 = 22')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    [3]x + 7 = 22
                </button>
            </div>

            {/* Main Interactive Equation Strip */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Equation Fields & Blanks
                    </label>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleAddBox()}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-sm transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Field Box</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleClearAll}
                            className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                </div>

                {/* Horizontal Box Strip */}
                <div className="flex items-center gap-2.5 overflow-x-auto pb-3 pt-1">
                    {boxes.map((box, idx) => (
                        <div
                            key={box.id}
                            className={`flex-shrink-0 flex flex-col items-center border-2 rounded-xl p-2.5 transition-all shadow-sm ${
                                box.isBlank
                                    ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                            style={{ minWidth: '95px' }}
                        >
                            {/* Input Field */}
                            <input
                                type="text"
                                value={box.value}
                                onChange={(e) => handleBoxValueChange(box.id, e.target.value)}
                                placeholder={`#${idx + 1}`}
                                className={`w-full text-center font-mono font-bold text-lg px-2 py-1.5 rounded-lg border outline-none transition-all ${
                                    box.isBlank
                                        ? 'bg-amber-100/60 border-amber-400 text-slate-950 focus:ring-2 focus:ring-amber-300'
                                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                                }`}
                            />

                            {/* Blank Toggle Checkbox */}
                            <div className="w-full flex items-center justify-between mt-2 pt-2 border-t border-slate-200/80">
                                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold select-none">
                                    <input
                                        type="checkbox"
                                        checked={box.isBlank}
                                        onChange={() => handleToggleBlank(box.id)}
                                        className="w-3.5 h-3.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                                    />
                                    <span className={box.isBlank ? 'text-amber-800 font-bold' : 'text-slate-500'}>
                                        {box.isBlank ? 'Hidden' : 'Hide'}
                                    </span>
                                </label>

                                <button
                                    type="button"
                                    onClick={() => handleRemoveBox(box.id)}
                                    className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
                                    title="Delete box"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Quick Add Plus Box */}
                    <button
                        type="button"
                        onClick={() => handleAddBox()}
                        className="flex-shrink-0 w-16 h-20 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 transition-all"
                        title="Add another box"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="text-[10px] font-semibold mt-1">Add</span>
                    </button>
                </div>

                {/* Quick Add Symbol Bar */}
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-200 text-xs">
                    <span className="text-slate-400 font-medium mr-1">Quick Add Operators:</span>
                    {['+', '−', '×', '÷', '=', 'x', '(', ')'].map((sym) => (
                        <button
                            key={sym}
                            type="button"
                            onClick={() => handleQuickAddOperator(sym)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700 shadow-sm transition-colors"
                        >
                            {sym}
                        </button>
                    ))}
                </div>
            </div>

            {/* Live Student Game Preview */}
            <div className="p-4 bg-slate-950 rounded-xl text-white space-y-2 border border-slate-800">
                <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
                        {t?.studentViewPreview || 'Live Student View Preview'}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                        {blankCount} hidden blank{blankCount === 1 ? '' : 's'}
                    </div>
                </div>

                {equationString.trim().length === 0 ? (
                    <div className="text-slate-500 italic text-sm py-2">
                        {t?.typeEquationPrompt || 'Fill in the boxes above to preview student view.'}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 flex-wrap font-mono text-xl py-1 text-slate-100">
                        {boxes.filter(b => b.value && b.value.trim() !== '').map((box, idx) => {
                            if (box.isBlank) {
                                return (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center justify-center px-4 py-1.5 bg-amber-400 text-slate-950 font-bold rounded-lg shadow border-2 border-amber-300 min-w-[3.5rem]"
                                        title={`Target answer: ${box.value}`}
                                    >
                                        ? ({box.value})
                                    </span>
                                );
                            }
                            return (
                                <span key={idx} className="font-semibold px-1">
                                    {box.value}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Validation Feedback */}
            {blankCount === 0 && equationString.trim().length > 0 && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                    <span>Please check the <strong>"Hide"</strong> box on at least one field to make it the puzzle blank for students!</span>
                </div>
            )}

            {/* Optional Hint Field */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t?.mathHintOptional || 'Math Hint (Optional)'}
                </label>
                <input
                    type="text"
                    value={hint}
                    onChange={(e) => {
                        setHint(e.target.value);
                        emitChange(boxes, e.target.value);
                    }}
                    placeholder="e.g. Think of inverse operations, or simplify first."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
            </div>
        </div>
    );
};

export default EquationBuilderEditor;
