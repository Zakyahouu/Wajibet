import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, Sparkles, AlertCircle, Keyboard, CheckCircle2, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import 'mathlive';

/**
 * Parses equation string into text and blank segments.
 * Supports bracketed tokens like "25 + [15] = 40" as well as standard equations.
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
 * Tokenizes plain equation string into individual clickable parts (numbers, variables, operators)
 * for the click-to-blank UI.
 */
const tokenizeEquation = (eqStr) => {
    if (!eqStr) return [];
    // If equation already has brackets, extract them cleanly
    const rawClean = eqStr.replace(/\[(.*?)\]/g, '$1');
    const tokens = [];
    // Match numbers with decimals, variables, operators, brackets, equals
    const tokenRegex = /(\d+(?:\.\d+)?|[a-zA-Z]|[-+×*÷/=()^±√])/g;
    let match;

    while ((match = tokenRegex.exec(rawClean)) !== null) {
        const val = match[1];
        const isOperand = /^\d+(?:\.\d+)?$/.test(val) || /^[a-zA-Z]$/.test(val);
        tokens.push({
            id: 'tok_' + match.index,
            value: val,
            isOperand,
            index: match.index,
            length: val.length
        });
    }

    return tokens;
};

const EquationBuilderEditor = ({ value, onChange }) => {
    const { t } = useLanguage();
    const mathFieldRef = useRef(null);

    // Initial state handling
    const initialEquation = typeof value === 'string'
        ? value
        : value?.equation || (Array.isArray(value?.segments)
            ? value.segments.map(s => s.type === 'blank' ? `[${s.options?.[s.correctIndex] || ''}]` : s.value).join('')
            : '25 + [15] = 40');

    const initialHint = typeof value === 'object' ? (value?.hint || '') : '';

    const [equation, setEquation] = useState(initialEquation);
    const [hint, setHint] = useState(initialHint);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    // Sync from props
    useEffect(() => {
        if (typeof value === 'string' && value !== equation) {
            setEquation(value);
        } else if (value && typeof value === 'object' && value.equation !== undefined && value.equation !== equation) {
            setEquation(value.equation || '');
            setHint(value.hint || '');
        }
    }, [value]);

    // Setup math-field listener
    useEffect(() => {
        const mf = mathFieldRef.current;
        if (!mf) return;

        // Configure mathfield
        mf.mathVirtualKeyboardPolicy = 'manual';
        
        const cleanForMathField = equation.replace(/\[(.*?)\]/g, '$1');
        if (mf.value !== cleanForMathField) {
            mf.setValue(cleanForMathField, { suppressChangeNotifications: true });
        }

        const handleInput = () => {
            const rawVal = mf.value || '';
            // If equation has brackets, try to keep the blank if the value is still present
            const currentSegments = parseEquationString(equation);
            const currentBlank = currentSegments.find(s => s.type === 'blank')?.value;

            let updatedEquation = rawVal;
            if (currentBlank && rawVal.includes(currentBlank)) {
                updatedEquation = rawVal.replace(currentBlank, `[${currentBlank}]`);
            }
            setEquation(updatedEquation);
            onChange({ equation: updatedEquation, hint });
        };

        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [equation, hint]);

    const handleToggleKeyboard = () => {
        if (window.mathVirtualKeyboard) {
            if (keyboardVisible) {
                window.mathVirtualKeyboard.hide();
                setKeyboardVisible(false);
            } else {
                window.mathVirtualKeyboard.show();
                setKeyboardVisible(true);
                mathFieldRef.current?.focus();
            }
        }
    };

    const handleSelectBlankToken = (token) => {
        const rawClean = equation.replace(/\[(.*?)\]/g, '$1');
        const currentSegments = parseEquationString(equation);
        const currentBlank = currentSegments.find(s => s.type === 'blank')?.value;

        // If clicking the current blank, toggle off
        if (currentBlank === token.value) {
            setEquation(rawClean);
            onChange({ equation: rawClean, hint });
            return;
        }

        // Replace the specific occurrence
        const newEq = rawClean.replace(token.value, `[${token.value}]`);
        setEquation(newEq);
        onChange({ equation: newEq, hint });
    };

    const handleHintChange = (newHint) => {
        setHint(newHint);
        onChange({ equation, hint: newHint });
    };

    const insertTemplate = (tmpl) => {
        setEquation(tmpl);
        if (mathFieldRef.current) {
            mathFieldRef.current.setValue(tmpl.replace(/\[(.*?)\]/g, '$1'));
        }
        onChange({ equation: tmpl, hint });
    };

    const segments = parseEquationString(equation);
    const blankCount = segments.filter(s => s.type === 'blank').length;
    const currentBlankValue = segments.find(s => s.type === 'blank')?.value || '';
    const tokens = tokenizeEquation(equation);

    return (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header with Virtual Keyboard Toggle */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>{t?.mathEquationBuilder || 'MathLive Equation Builder'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleToggleKeyboard}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            keyboardVisible
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700'
                        }`}
                    >
                        <Keyboard className="w-3.5 h-3.5" />
                        <span>{keyboardVisible ? 'Hide Math Keyboard' : 'Open Math Keyboard'}</span>
                    </button>
                </div>
            </div>

            {/* Quick Math Templates */}
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
                    onClick={() => insertTemplate('12 × [8] = 96')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    12 × [8] = 96
                </button>
                <button
                    type="button"
                    onClick={() => insertTemplate('[3]x + 7 = 22')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    [3]x + 7 = 22
                </button>
            </div>

            {/* MathLive Interactive Input Field */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t?.enterEquation || 'Enter Equation (Type or use Math Keyboard)'}
                </label>
                <div className="p-3 bg-slate-50 border-2 border-slate-200 focus-within:border-indigo-500 focus-within:bg-white rounded-xl transition-all shadow-inner">
                    <math-field
                        ref={mathFieldRef}
                        style={{
                            display: 'block',
                            width: '100%',
                            fontSize: '1.5rem',
                            fontFamily: 'Fira Code, Consolas, monospace',
                            outline: 'none',
                            background: 'transparent',
                            color: '#0f172a'
                        }}
                    />
                </div>
            </div>

            {/* Click-to-Blank Interactive Token Selector */}
            <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <span>👉 Click the value you want students to solve for:</span>
                    </span>
                    {currentBlankValue && (
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Blank: {currentBlankValue}</span>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                    {tokens.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">Type an equation above to select missing blanks.</span>
                    ) : (
                        tokens.map((tok) => {
                            const isBlank = currentBlankValue === tok.value;
                            return (
                                <button
                                    key={tok.id}
                                    type="button"
                                    onClick={() => handleSelectBlankToken(tok)}
                                    className={`px-3.5 py-1.5 rounded-lg font-mono text-sm font-bold transition-all transform active:scale-95 ${
                                        isBlank
                                            ? 'bg-amber-400 text-slate-950 border-2 border-amber-500 shadow-md ring-2 ring-amber-200'
                                            : tok.isOperand
                                                ? 'bg-white hover:bg-indigo-100 text-indigo-900 border border-slate-200 shadow-sm'
                                                : 'bg-slate-200 text-slate-600 cursor-default pointer-events-none'
                                    }`}
                                >
                                    {tok.value} {isBlank && <span className="text-[10px] uppercase font-bold ml-1">🎯 Missing</span>}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Live Student Game Preview */}
            <div className="p-4 bg-slate-950 rounded-xl text-white space-y-2 border border-slate-800">
                <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
                    {t?.studentViewPreview || 'Live Student View Preview'}
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
            {blankCount === 0 && equation.trim().length > 0 && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                    <span>Please click on one of the number buttons above to mark it as the missing puzzle blank!</span>
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
