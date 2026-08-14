import React, { useState, useEffect } from 'react';
import { BookOpen, Sparkles, Plus, Trash2, CheckCircle2, HelpCircle, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const GRAMMAR_CATEGORIES = [
    'Verb Tenses & Aspects',
    'Subject-Verb Agreement',
    'Prepositions of Time & Place',
    'Articles (a / an / the / ∅)',
    'Conditionals (0, 1st, 2nd, 3rd)',
    'Modals & Auxiliaries',
    'Pronouns & Relative Clauses',
    'Passive Voice & Causatives',
    'Comparatives & Superlatives',
    'Other / Custom Rule'
];

const GrammarExerciseEditor = ({ value, onChange }) => {
    const { t } = useLanguage();

    // Parse legacy segment format if present
    const parseLegacyValue = (v) => {
        if (!v || typeof v !== 'object') return null;
        if (Array.isArray(v.segments)) {
            const blank = v.segments.find(s => s.type === 'blank');
            const textParts = v.segments.map(s => s.type === 'blank' ? '____' : s.value).join('');
            return {
                category: v.category || 'Verb Tenses & Aspects',
                ruleLabel: v.ruleLabel || '',
                ruleTip: v.ruleTip || '',
                sentence: textParts,
                options: blank?.options || ['', ''],
                correctIndex: blank?.correctIndex || 0,
                explanation: v.explanation || ''
            };
        }
        return null;
    };

    const legacy = parseLegacyValue(value);

    const [category, setCategory] = useState(value?.category || legacy?.category || 'Verb Tenses & Aspects');
    const [ruleLabel, setRuleLabel] = useState(value?.ruleLabel || legacy?.ruleLabel || '');
    const [ruleTip, setRuleTip] = useState(value?.ruleTip || legacy?.ruleTip || '');
    const [sentence, setSentence] = useState(value?.sentence || legacy?.sentence || '');
    const [options, setOptions] = useState(Array.isArray(value?.options) ? value.options : (legacy?.options || ['', '']));
    const [correctIndex, setCorrectIndex] = useState(Number.isInteger(value?.correctIndex) ? value.correctIndex : (legacy?.correctIndex || 0));
    const [explanation, setExplanation] = useState(value?.explanation || legacy?.explanation || '');

    useEffect(() => {
        if (value && typeof value === 'object') {
            if (value.category !== undefined && value.category !== category) setCategory(value.category);
            if (value.ruleLabel !== undefined && value.ruleLabel !== ruleLabel) setRuleLabel(value.ruleLabel);
            if (value.ruleTip !== undefined && value.ruleTip !== ruleTip) setRuleTip(value.ruleTip);
            if (value.sentence !== undefined && value.sentence !== sentence) setSentence(value.sentence);
            if (Array.isArray(value.options)) setOptions(value.options);
            if (Number.isInteger(value.correctIndex)) setCorrectIndex(value.correctIndex);
            if (value.explanation !== undefined && value.explanation !== explanation) setExplanation(value.explanation);
        }
    }, [value]);

    const emitChange = (updates) => {
        const payload = {
            category,
            ruleLabel,
            ruleTip,
            sentence,
            options,
            correctIndex,
            explanation,
            ...updates
        };
        onChange(payload);
    };

    const handleOptionChange = (idx, val) => {
        const nextOptions = [...options];
        nextOptions[idx] = val;
        setOptions(nextOptions);
        emitChange({ options: nextOptions });
    };

    const handleAddOption = () => {
        if (options.length >= 4) return;
        const nextOptions = [...options, ''];
        setOptions(nextOptions);
        emitChange({ options: nextOptions });
    };

    const handleRemoveOption = (idx) => {
        if (options.length <= 2) return;
        const nextOptions = options.filter((_, i) => i !== idx);
        let nextCorrect = correctIndex;
        if (correctIndex === idx) {
            nextCorrect = 0;
        } else if (correctIndex > idx) {
            nextCorrect -= 1;
        }
        setOptions(nextOptions);
        setCorrectIndex(nextCorrect);
        emitChange({ options: nextOptions, correctIndex: nextCorrect });
    };

    const handleSetCorrect = (idx) => {
        setCorrectIndex(idx);
        emitChange({ correctIndex: idx });
    };

    return (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                    <BookOpen className="w-4 h-4" />
                    <span>{t?.grammarExerciseEditor || 'Grammar Rule & Exercise Builder'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{t?.grammarGuidance || 'Define rule, target sentence, and contrasting choices'}</span>
                </div>
            </div>

            {/* Grammar Rule & Category Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                        {t?.grammarCategory || 'Grammar Category'}
                    </label>
                    <select
                        value={category}
                        onChange={(e) => {
                            setCategory(e.target.value);
                            emitChange({ category: e.target.value });
                        }}
                        className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs font-medium text-slate-800 focus:border-emerald-500 focus:outline-none"
                    >
                        {GRAMMAR_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                        {t?.specificRuleLabel || 'Specific Rule Name'}
                    </label>
                    <input
                        type="text"
                        value={ruleLabel}
                        onChange={(e) => {
                            setRuleLabel(e.target.value);
                            emitChange({ ruleLabel: e.target.value });
                        }}
                        placeholder="e.g. Past Simple vs Present Perfect (since / for)"
                        className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                        {t?.ruleTipOrHint || 'Rule Tip / Explanation (Shown in-game on Rule Card)'}
                    </label>
                    <textarea
                        rows={2}
                        value={ruleTip}
                        onChange={(e) => {
                            setRuleTip(e.target.value);
                            emitChange({ ruleTip: e.target.value });
                        }}
                        placeholder="e.g. Use 'since' for a specific starting point in time (2018), and 'for' for a duration of time (5 years)."
                        className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                    />
                </div>
            </div>

            {/* Sentence with Blank */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t?.grammarSentence || 'Sentence with Grammar Blank (use [____] or ___ for blank)'}
                </label>
                <input
                    type="text"
                    value={sentence}
                    onChange={(e) => {
                        setSentence(e.target.value);
                        emitChange({ sentence: e.target.value });
                    }}
                    placeholder="e.g. I have lived in London [____] 2018."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 focus:outline-none transition-all"
                />
            </div>

            {/* Targeted Grammar Choices */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                        {t?.contrastingGrammarOptions || 'Grammar Choices (Select the correct option)'}
                    </label>
                    {options.length < 4 && (
                        <button
                            type="button"
                            onClick={handleAddOption}
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" />
                            <span>{t?.addChoice || 'Add Option'}</span>
                        </button>
                    )}
                </div>

                <div className="space-y-2">
                    {options.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleSetCorrect(idx)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
                                    correctIndex === idx
                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                        : 'bg-white border-slate-300 text-slate-400 hover:border-emerald-400'
                                }`}
                                title={correctIndex === idx ? 'Marked as Correct Answer' : 'Click to mark as Correct Answer'}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <input
                                type="text"
                                value={opt}
                                onChange={(e) => handleOptionChange(idx, e.target.value)}
                                placeholder={`Option ${idx + 1} (e.g. ${idx === 0 ? 'since' : idx === 1 ? 'for' : 'during'})`}
                                className={`flex-1 px-3 py-2 border rounded-lg text-sm transition-colors ${
                                    correctIndex === idx
                                        ? 'bg-emerald-50/40 border-emerald-400 text-emerald-950 font-medium'
                                        : 'bg-slate-50 border-slate-200 text-slate-800'
                                } focus:bg-white focus:border-emerald-500 focus:outline-none`}
                            />
                            {options.length > 2 && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveOption(idx)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-md transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Why is this correct? (Review Explanation) */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t?.explanationOnReview || 'Why is this correct? (Review Feedback)'}
                </label>
                <input
                    type="text"
                    value={explanation}
                    onChange={(e) => {
                        setExplanation(e.target.value);
                        emitChange({ explanation: e.target.value });
                    }}
                    placeholder="e.g. '2018' is a starting point, so 'since' is the grammatically correct preposition."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
            </div>
        </div>
    );
};

export default GrammarExerciseEditor;
