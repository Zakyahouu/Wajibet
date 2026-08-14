import React, { useState, useEffect } from 'react';
import { Sparkles, HelpCircle, AlertCircle, CheckCircle2, RotateCcw, Delete } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Parses equation text with brackets e.g. "25 + [15] = [40]"
 * into text and blank segments.
 */
export const parseEquationString = (str) => {
    if (!str || typeof str !== 'string') return [];
    const segments = [];
    const regex = /\[(.*?)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(str)) !== null) {
        if (match.index > lastIndex) {
            segments.push({
                type: 'text',
                value: str.substring(lastIndex, match.index)
            });
        }
        segments.push({
            type: 'blank',
            value: match[1].trim()
        });
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < str.length) {
        segments.push({
            type: 'text',
            value: str.substring(lastIndex)
        });
    }

    return segments;
};

/**
 * Extracts numbers/operands from a raw equation string so teacher can toggle multiple blanks.
 */
const extractOperands = (eqStr) => {
    if (!eqStr) return [];
    const rawClean = eqStr.replace(/\[(.*?)\]/g, '$1');
    const tokens = [];
    // Match numbers (including decimals) or standalone algebra variables
    const regex = /(\d+(?:\.\d+)?|[a-zA-Z])/g;
    let match;

    while ((match = regex.exec(rawClean)) !== null) {
        tokens.push({
            index: match.index,
            value: match[1],
            length: match[1].length
        });
    }
    return tokens;
};

const EquationBuilderEditor = ({ value, onChange }) => {
    const { t } = useLanguage();

    // Initial state handling
    const initialEquation = typeof value === 'string'
        ? value
        : value?.equation || (Array.isArray(value?.segments)
            ? value.segments.map(s => s.type === 'blank' ? `[${s.options?.[s.correctIndex] || ''}]` : s.value).join('')
            : '25 + [15] = 40');

    const initialHint = typeof value === 'object' ? (value?.hint || '') : '';

    const [equation, setEquation] = useState(initialEquation);
    const [hint, setHint] = useState(initialHint);

    useEffect(() => {
        if (typeof value === 'string' && value !== equation) {
            setEquation(value);
        } else if (value && typeof value === 'object' && value.equation !== undefined && value.equation !== equation) {
            setEquation(value.equation || '');
            setHint(value.hint || '');
        }
    }, [value]);

    // Get clean equation without brackets
    const cleanEquation = equation.replace(/\[(.*?)\]/g, '$1');
    const segments = parseEquationString(equation);
    const blankValues = segments.filter(s => s.type === 'blank').map(s => s.value);
    const operands = extractOperands(cleanEquation);

    // Calculator button press handler
    const handleKeypadPress = (key) => {
        let newClean = cleanEquation;

        if (key === 'AC') {
            newClean = '';
            setEquation('');
            onChange({ equation: '', hint });
            return;
        }

        if (key === '⌫') {
            // Remove last character (and space if preceding)
            newClean = newClean.trimEnd().slice(0, -1).trimEnd();
        } else if (['+', '−', '×', '÷', '='].includes(key)) {
            newClean = newClean.trimEnd() + ' ' + key + ' ';
        } else {
            newClean = newClean + key;
        }

        // Reconstruct equation preserving any selected blanks that are still present
        rebuildEquationWithBlanks(newClean, blankValues);
    };

    const rebuildEquationWithBlanks = (rawClean, activeBlanks) => {
        let rebuilt = rawClean;
        // Sort blanks by length descending so longer numbers are replaced first
        const sortedBlanks = [...activeBlanks].sort((a, b) => b.length - a.length);

        sortedBlanks.forEach((bVal) => {
            if (bVal && rebuilt.includes(bVal) && !rebuilt.includes(`[${bVal}]`)) {
                rebuilt = rebuilt.replace(bVal, `[${bVal}]`);
            }
        });

        setEquation(rebuilt);
        onChange({ equation: rebuilt, hint });
    };

    // Toggle a number as blank (multi-select supported!)
    const handleToggleBlank = (operandVal) => {
        let newBlanks = [...blankValues];
        if (newBlanks.includes(operandVal)) {
            // Remove from blanks
            newBlanks = newBlanks.filter(b => b !== operandVal);
        } else {
            // Add to blanks
            newBlanks.push(operandVal);
        }
        rebuildEquationWithBlanks(cleanEquation, newBlanks);
    };

    const handleHintChange = (newHint) => {
        setHint(newHint);
        onChange({ equation, hint: newHint });
    };

    const insertTemplate = (tmpl) => {
        setEquation(tmpl);
        onChange({ equation: tmpl, hint });
    };

    const calculatorButtons = [
        ['7', '8', '9', '÷', '⌫'],
        ['4', '5', '6', '×', 'AC'],
        ['1', '2', '3', '−', '('],
        ['0', '.', '=', '+', ')']
    ];

    return (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>{t?.mathEquationBuilder || 'Visual Equation Builder'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Tap calculator keys & click any numbers to make them blanks (multiple allowed)</span>
                </div>
            </div>

            {/* Quick Templates */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-slate-400 font-medium">{t?.quickTemplates || 'Templates:'}</span>
                <button
                    type="button"
                    onClick={() => insertTemplate('25 + [15] = 40')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    25 + [15] = 40
                </button>
                <button
                    type="button"
                    onClick={() => insertTemplate('100 ÷ [4] = 25')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    100 ÷ [4] = 25
                </button>
                <button
                    type="button"
                    onClick={() => insertTemplate('[12] × [8] = 96')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    [12] × [8] = 96
                </button>
                <button
                    type="button"
                    onClick={() => insertTemplate('[3]x + 7 = 22')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    [3]x + 7 = 22
                </button>
            </div>

            {/* Visual Calculator Grid & Display */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Left Column: Calculator Keypad */}
                <div className="lg:col-span-6 bg-slate-900 p-4 rounded-xl shadow-inner border border-slate-800 space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        Calculator Keypad
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                        {calculatorButtons.flat().map((btnVal) => {
                            const isAction = ['⌫', 'AC'].includes(btnVal);
                            const isOperator = ['+', '−', '×', '÷', '='].includes(btnVal);
                            return (
                                <button
                                    key={btnVal}
                                    type="button"
                                    onClick={() => handleKeypadPress(btnVal)}
                                    className={`h-11 rounded-lg font-mono font-bold text-base flex items-center justify-center transition-all transform active:scale-95 shadow-sm ${
                                        isAction
                                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs'
                                            : isOperator
                                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white text-lg'
                                                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                                    }`}
                                >
                                    {btnVal}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right Column: Equation Screen & Interactive Multi-Blank Chooser */}
                <div className="lg:col-span-6 space-y-3">
                    {/* Current Equation Display */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Current Equation
                        </label>
                        <div className="font-mono text-2xl font-bold text-slate-900 min-h-[2.5rem] flex items-center">
                            {cleanEquation || <span className="text-slate-400 font-normal italic text-sm">Tap calculator buttons on the left...</span>}
                        </div>
                    </div>

                    {/* Interactive Multi-Select Blanks */}
                    <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-950">
                                🎯 Choose Missing Blank(s) — Click any numbers:
                            </span>
                            <span className="text-xs font-semibold text-indigo-600">
                                {blankValues.length} {blankValues.length === 1 ? 'blank' : 'blanks'} selected
                            </span>
                        </div>

                        {operands.length === 0 ? (
                            <div className="text-xs text-slate-400 italic py-1">
                                Enter numbers in the calculator to select blanks.
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 flex-wrap pt-1">
                                {operands.map((op, idx) => {
                                    const isBlank = blankValues.includes(op.value);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleToggleBlank(op.value)}
                                            className={`px-3.5 py-1.5 rounded-lg font-mono text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm border ${
                                                isBlank
                                                    ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-md ring-2 ring-amber-200'
                                                    : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                                            }`}
                                        >
                                            <span>{op.value}</span>
                                            {isBlank ? (
                                                <span className="text-[10px] uppercase font-extrabold bg-amber-500 text-slate-950 px-1 rounded">
                                                    Blank ✓
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 font-normal">
                                                    + Make Blank
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Live Student Game Preview */}
            <div className="p-4 bg-slate-950 rounded-xl text-white space-y-2 border border-slate-800">
                <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
                        {t?.studentViewPreview || 'Live Student View Preview'}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                        {blankValues.length > 0 ? `${blankValues.length} target blank(s)` : 'No blanks selected yet'}
                    </div>
                </div>

                {segments.length === 0 ? (
                    <div className="text-slate-500 italic text-sm py-2">
                        {t?.typeEquationPrompt || 'Equation will appear here.'}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 flex-wrap font-mono text-xl py-1 text-slate-100">
                        {segments.map((seg, idx) => {
                            if (seg.type === 'blank') {
                                return (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center justify-center px-4 py-1.5 bg-amber-400 text-slate-950 font-bold rounded-lg shadow border-2 border-amber-300 min-w-[3.5rem]"
                                        title={`Target answer: ${seg.value || '(empty)'}`}
                                    >
                                        {seg.value ? `? (${seg.value})` : '?'}
                                    </span>
                                );
                            }
                            return (
                                <span key={idx} className="font-semibold px-1">
                                    {seg.value}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Validation Feedback */}
            {blankValues.length === 0 && cleanEquation.trim().length > 0 && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                    <span>Please click at least one number above to mark it as the missing puzzle blank!</span>
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
                    onChange={(e) => handleHintChange(e.target.value)}
                    placeholder="e.g. Think of inverse operations, or simplify first."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
            </div>
        </div>
    );
};

export default EquationBuilderEditor;
