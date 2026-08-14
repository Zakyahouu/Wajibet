import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, CheckCircle, HelpCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const DEFAULT_RULES = [
    'Since vs. For',
    "Their vs. There vs. They're",
    'In / On / At (Prepositions)',
    'Past Simple vs. Present Perfect',
    'A vs. An (Articles)',
    'Much vs. Many',
    'Subject-Verb Agreement',
    'Custom Rule'
];

const GrammarExerciseEditor = ({ value, onChange }) => {
    const { t } = useLanguage();

    const initialRule = value?.ruleLabel || 'Since vs. For';
    const initialIsCustom = !DEFAULT_RULES.slice(0, -1).includes(initialRule);

    const [ruleSelect, setRuleSelect] = useState(initialIsCustom ? 'Custom Rule' : initialRule);
    const [customRule, setCustomRule] = useState(initialIsCustom ? initialRule : '');
    const [sentence, setSentence] = useState(value?.sentence || 'I have lived in this city ____ 2018.');
    const [options, setOptions] = useState(Array.isArray(value?.options) && value.options.length >= 2 ? value.options : ['since', 'for']);
    const [correctIndex, setCorrectIndex] = useState(Number.isInteger(value?.correctIndex) ? value.correctIndex : 0);

    useEffect(() => {
        if (value && typeof value === 'object') {
            if (value.ruleLabel !== undefined) {
                const isCust = !DEFAULT_RULES.slice(0, -1).includes(value.ruleLabel);
                setRuleSelect(isCust ? 'Custom Rule' : value.ruleLabel);
                if (isCust) setCustomRule(value.ruleLabel);
            }
            if (value.sentence !== undefined && value.sentence !== sentence) {
                setSentence(value.sentence);
            }
            if (Array.isArray(value.options) && value.options.length >= 2) {
                setOptions(value.options);
            }
            if (Number.isInteger(value.correctIndex)) {
                setCorrectIndex(value.correctIndex);
            }
        }
    }, [value]);

    const getActiveRuleLabel = (sel = ruleSelect, cust = customRule) => {
        return sel === 'Custom Rule' ? (cust.trim() || 'Custom Rule') : sel;
    };

    const emitChange = (updates = {}) => {
        const activeLabel = updates.ruleLabel !== undefined
            ? updates.ruleLabel
            : getActiveRuleLabel(updates.ruleSelect || ruleSelect, updates.customRule !== undefined ? updates.customRule : customRule);

        const payload = {
            category: 'Grammar Rule',
            ruleLabel: activeLabel,
            ruleTip: '',
            sentence: updates.sentence !== undefined ? updates.sentence : sentence,
            options: updates.options || options,
            correctIndex: updates.correctIndex !== undefined ? updates.correctIndex : correctIndex,
            explanation: ''
        };
        onChange(payload);
    };

    const handleRuleSelectChange = (newSel) => {
        setRuleSelect(newSel);
        const label = getActiveRuleLabel(newSel, customRule);
        emitChange({ ruleSelect: newSel, ruleLabel: label });
    };

    const handleCustomRuleChange = (newCust) => {
        setCustomRule(newCust);
        emitChange({ customRule: newCust, ruleLabel: newCust });
    };

    const handleSentenceChange = (newSent) => {
        setSentence(newSent);
        emitChange({ sentence: newSent });
    };

    const handleOptionChange = (idx, val) => {
        const next = [...options];
        next[idx] = val;
        setOptions(next);
        emitChange({ options: next });
    };

    const handleAddOption = () => {
        if (options.length >= 4) return;
        const next = [...options, ''];
        setOptions(next);
        emitChange({ options: next });
    };

    const handleRemoveOption = (idx) => {
        if (options.length <= 2) return;
        const next = options.filter((_, i) => i !== idx);
        let nextCorrect = correctIndex;
        if (correctIndex === idx) nextCorrect = 0;
        else if (correctIndex > idx) nextCorrect -= 1;
        setOptions(next);
        setCorrectIndex(nextCorrect);
        emitChange({ options: next, correctIndex: nextCorrect });
    };

    const activeRule = getActiveRuleLabel();
    const sentencePreview = sentence.replace(/____/g, `[ ${options[correctIndex] || '?'} ]`);

    return (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <BookOpen className="w-4 h-4" />
                    <span>{t?.grammarExerciseEditor || 'Grammar Exercise'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Choose rule, write sentence with <strong>____</strong>, and set choices.</span>
                </div>
            </div>

            {/* Step 1: Grammar Rule Dropdown */}
            <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    1. Grammar Rule
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <select
                        value={ruleSelect}
                        onChange={(e) => handleRuleSelectChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm font-medium focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                    >
                        {DEFAULT_RULES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>

                    {ruleSelect === 'Custom Rule' && (
                        <input
                            type="text"
                            value={customRule}
                            onChange={(e) => handleCustomRuleChange(e.target.value)}
                            placeholder="Type custom rule name..."
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm font-medium focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                        />
                    )}
                </div>
            </div>

            {/* Step 2: Sentence Input */}
            <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Sentence (Use <code className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-bold">____</code> for the blank)
                </label>
                <input
                    type="text"
                    value={sentence}
                    onChange={(e) => handleSentenceChange(e.target.value)}
                    placeholder="e.g. She has been waiting here ____ 2 o'clock."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm font-medium focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
            </div>

            {/* Step 3: Contrast Choices */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        3. Contrast Choices (Select the correct answer)
                    </label>
                    {options.length < 4 && (
                        <button
                            type="button"
                            onClick={handleAddOption}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Choice</span>
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {options.map((opt, idx) => {
                        const isCorrect = correctIndex === idx;
                        return (
                            <div
                                key={idx}
                                className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                                    isCorrect
                                        ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-100'
                                        : 'bg-slate-50 border-slate-200 hover:bg-white'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="grammarCorrectOption"
                                    checked={isCorrect}
                                    onChange={() => {
                                        setCorrectIndex(idx);
                                        emitChange({ correctIndex: idx });
                                    }}
                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer ml-1"
                                />
                                <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                                    placeholder={`Choice ${idx + 1}`}
                                    className="flex-1 px-2 py-1 text-sm bg-transparent border-none outline-none font-semibold text-slate-800"
                                />
                                {options.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveOption(idx)}
                                        className="text-slate-400 hover:text-red-500 p-1 rounded"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bright Professional Live Preview */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Student Preview
                    </span>
                    <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
                        {activeRule}
                    </span>
                </div>

                <div className="text-base font-semibold text-slate-800 py-1">
                    {sentence ? sentencePreview : <span className="text-slate-400 italic font-normal">Enter sentence above...</span>}
                </div>

                <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-slate-500 font-medium">Choices:</span>
                    {options.filter(o => o.trim() !== '').map((opt, i) => (
                        <span
                            key={i}
                            className={`px-3 py-1 rounded-md text-xs font-bold border transition-colors ${
                                i === correctIndex
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                                    : 'bg-white text-slate-700 border-slate-200 shadow-sm'
                            }`}
                        >
                            {opt} {i === correctIndex && '✓'}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default GrammarExerciseEditor;
