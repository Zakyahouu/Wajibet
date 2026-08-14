import React, { useState, useEffect } from 'react';
import { HelpCircle, Sparkles, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Parses equation text with brackets e.g. "25 + [15] = 40" or "[3]x + 4 = 19"
 * into text and blank segments for preview and validation.
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

const EquationBuilderEditor = ({ value, onChange }) => {
    const { t } = useLanguage();

    // Handle initial state from either { equation, hint } or string or legacy segments
    const initialEquation = typeof value === 'string'
        ? value
        : value?.equation || (Array.isArray(value?.segments)
            ? value.segments.map(s => s.type === 'blank' ? `[${s.options?.[s.correctIndex] || ''}]` : s.value).join('')
            : '');

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

    const handleEquationChange = (newEquation) => {
        setEquation(newEquation);
        onChange({ equation: newEquation, hint });
    };

    const handleHintChange = (newHint) => {
        setHint(newHint);
        onChange({ equation, hint: newHint });
    };

    const segments = parseEquationString(equation);
    const blankCount = segments.filter(s => s.type === 'blank').length;
    const hasEmptyBlank = segments.some(s => s.type === 'blank' && s.value.length === 0);

    const insertTemplate = (template) => {
        handleEquationChange(template);
    };

    return (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header with Quick Info */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>{t?.mathEquationBuilder || 'Math Equation Builder'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{t?.wrapBlanksInBrackets || 'Wrap blanks in brackets: [number]'}</span>
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
                    onClick={() => insertTemplate('[3]x + 7 = 22')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    [3]x + 7 = 22
                </button>
                <button
                    type="button"
                    onClick={() => insertTemplate('1/2 + [2/4] = 1')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-md font-mono transition-colors"
                >
                    1/2 + [2/4] = 1
                </button>
            </div>

            {/* Equation Input */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t?.equationText || 'Equation with Target Blanks'}
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={equation}
                        onChange={(e) => handleEquationChange(e.target.value)}
                        placeholder="e.g. 12 × [4] = 48 or [5] + 15 = 20"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono text-base focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
                    />
                </div>
            </div>

            {/* Live Visual Math Preview */}
            <div className="p-4 bg-slate-900 rounded-lg text-white">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {t?.studentViewPreview || 'Student View Preview'}
                </div>
                {segments.length === 0 ? (
                    <div className="text-slate-500 italic text-sm py-2">
                        {t?.typeEquationPrompt || 'Type an equation above to preview how students will see it.'}
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 flex-wrap font-mono text-lg py-1">
                        {segments.map((seg, idx) => {
                            if (seg.type === 'blank') {
                                return (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center justify-center px-3 py-1 bg-amber-400 text-slate-950 font-bold rounded shadow-sm border-2 border-amber-300 min-w-[3rem]"
                                        title={`Target answer: ${seg.value || '(empty)'}`}
                                    >
                                        {seg.value || '?'}
                                    </span>
                                );
                            }
                            return (
                                <span key={idx} className="text-slate-100 font-semibold px-1">
                                    {seg.value}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Validation Feedback */}
            {blankCount === 0 && equation.trim().length > 0 && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2.5 rounded-md text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{t?.noBlanksWarning || 'No blanks specified! Use square brackets around the answer, e.g. 5 + [10] = 15.'}</span>
                </div>
            )}
            {hasEmptyBlank && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2.5 rounded-md text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{t?.emptyBlankError || 'Blank brackets cannot be empty. Specify the expected answer inside: [answer].'}</span>
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
                    placeholder="e.g. Think of inverse operations, or simplify fractions first."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
            </div>
        </div>
    );
};

export default EquationBuilderEditor;
