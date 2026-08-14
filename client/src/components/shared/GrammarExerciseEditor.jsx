import React, { useState, useEffect } from 'react';
import { BookOpen, Sparkles, Plus, Trash2, CheckCircle2, HelpCircle, AlertCircle, BookmarkPlus, Check } from 'lucide-react';
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
    'Homophones & Confusing Words',
    'Other / Custom Rule'
];

const DEFAULT_PRESET_RULES = [
    {
        id: 'rule_since_for',
        category: 'Verb Tenses & Aspects',
        ruleLabel: 'Since vs. For (Present Perfect)',
        ruleTip: "Use 'since' for a specific point in time (e.g. 2018, Monday) and 'for' for a duration of time (e.g. 3 years, 2 hours)."
    },
    {
        id: 'rule_their_there',
        category: 'Homophones & Confusing Words',
        ruleLabel: "Their vs. There vs. They're",
        ruleTip: "'Their' is possessive, 'There' refers to a place, and 'They\\'re' is a contraction for 'they are'."
    },
    {
        id: 'rule_in_on_at',
        category: 'Prepositions of Time & Place',
        ruleLabel: 'In / On / At (Prepositions of Time)',
        ruleTip: "Use 'at' for precise times (at 5 PM), 'on' for days and dates (on Monday), and 'in' for months, years, and longer periods (in July, in 2020)."
    },
    {
        id: 'rule_subject_verb',
        category: 'Subject-Verb Agreement',
        ruleLabel: 'Singular vs. Plural Agreement',
        ruleTip: "Singular third-person subjects take singular verbs ending in -s (he runs), while plural subjects take base verbs (they run)."
    },
    {
        id: 'rule_articles',
        category: 'Articles (a / an / the / ∅)',
        ruleLabel: 'Indefinite Articles (A vs. An)',
        ruleTip: "Use 'a' before words starting with a consonant sound, and 'an' before words starting with a vowel sound."
    }
];

// Helper to get all saved rules from localStorage and presets
const getStoredRules = () => {
    try {
        const custom = localStorage.getItem('wajibet_teacher_grammar_rules');
        if (custom) {
            const parsed = JSON.parse(custom);
            if (Array.isArray(parsed)) {
                return [...DEFAULT_PRESET_RULES, ...parsed];
            }
        }
    } catch (e) {
        // ignore
    }
    return DEFAULT_PRESET_RULES;
};

const saveCustomRule = (newRule) => {
    try {
        const custom = localStorage.getItem('wajibet_teacher_grammar_rules');
        const parsed = custom ? JSON.parse(custom) : [];
        const filtered = parsed.filter(r => r.ruleLabel !== newRule.ruleLabel);
        const updated = [...filtered, newRule];
        localStorage.setItem('wajibet_teacher_grammar_rules', JSON.stringify(updated));
    } catch (e) {
        // ignore
    }
};

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

    // Rule library state
    const [ruleList, setRuleList] = useState(getStoredRules);
    const [selectedRuleId, setSelectedRuleId] = useState('');
    const [isDefiningNewRule, setIsDefiningNewRule] = useState(false);
    const [newRuleForm, setNewRuleForm] = useState({
        category: 'Verb Tenses & Aspects',
        ruleLabel: '',
        ruleTip: ''
    });

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

    const handleSelectRule = (ruleId) => {
        setSelectedRuleId(ruleId);
        if (!ruleId) return;

        const found = ruleList.find(r => r.id === ruleId);
        if (found) {
            setCategory(found.category);
            setRuleLabel(found.ruleLabel);
            setRuleTip(found.ruleTip);
            emitChange({
                category: found.category,
                ruleLabel: found.ruleLabel,
                ruleTip: found.ruleTip
            });
        }
    };

    const handleSaveNewCustomRule = (e) => {
        e.preventDefault();
        const trimmedLabel = newRuleForm.ruleLabel.trim();
        if (!trimmedLabel) return;

        const newRule = {
            id: 'custom_' + Date.now(),
            category: newRuleForm.category,
            ruleLabel: trimmedLabel,
            ruleTip: newRuleForm.ruleTip.trim()
        };

        saveCustomRule(newRule);
        const updatedList = getStoredRules();
        setRuleList(updatedList);
        setSelectedRuleId(newRule.id);

        setCategory(newRule.category);
        setRuleLabel(newRule.ruleLabel);
        setRuleTip(newRule.ruleTip);

        emitChange({
            category: newRule.category,
            ruleLabel: newRule.ruleLabel,
            ruleTip: newRule.ruleTip
        });

        setIsDefiningNewRule(false);
        setNewRuleForm({
            category: 'Verb Tenses & Aspects',
            ruleLabel: '',
            ruleTip: ''
        });
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

    const sentencePreview = sentence.replace(/____/g, `[ ${options[correctIndex] || '?'} ]`);

    return (
        <div className="space-y-5 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <BookOpen className="w-4 h-4" />
                    <span>{t?.grammarExerciseEditor || 'Grammar Rule Exercise'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Select a defined grammar rule or create a new one to reuse across questions.</span>
                </div>
            </div>

            {/* Section 1: Grammar Rule Dropdown & Definition Bar */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        1. Grammar Rule Selector
                    </label>
                    <button
                        type="button"
                        onClick={() => setIsDefiningNewRule(!isDefiningNewRule)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                            isDefiningNewRule
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 shadow-sm'
                        }`}
                    >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>{isDefiningNewRule ? 'Close Rule Definition' : '+ Define New Rule'}</span>
                    </button>
                </div>

                {/* Dropdown to pick from defined rules */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-8">
                        <select
                            value={selectedRuleId}
                            onChange={(e) => handleSelectRule(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm font-medium focus:border-indigo-500 focus:outline-none transition-all shadow-sm"
                        >
                            <option value="">-- Choose a Defined Grammar Rule to Auto-Fill --</option>
                            {ruleList.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.category}: {r.ruleLabel}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="md:col-span-4 flex items-center text-xs text-slate-500 italic">
                        Select a rule to auto-populate the category and rule guidance below.
                    </div>
                </div>

                {/* Inline "Define New Rule" Drawer */}
                {isDefiningNewRule && (
                    <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3 animation-fade-in">
                        <div className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                            Create & Save a New Grammar Rule
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Grammar Category
                                </label>
                                <select
                                    value={newRuleForm.category}
                                    onChange={(e) => setNewRuleForm({ ...newRuleForm, category: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
                                >
                                    {GRAMMAR_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Rule Title (e.g. "Since vs. For")
                                </label>
                                <input
                                    type="text"
                                    value={newRuleForm.ruleLabel}
                                    onChange={(e) => setNewRuleForm({ ...newRuleForm, ruleLabel: e.target.value })}
                                    placeholder="e.g. Past Simple vs Present Perfect"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Rule Guidance / Tip (Shown to students)
                            </label>
                            <input
                                type="text"
                                value={newRuleForm.ruleTip}
                                onChange={(e) => setNewRuleForm({ ...newRuleForm, ruleTip: e.target.value })}
                                placeholder="e.g. Use 'since' for starting points, and 'for' for duration."
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setIsDefiningNewRule(false)}
                                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveNewCustomRule}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm"
                            >
                                <Check className="w-3.5 h-3.5" />
                                <span>Save & Apply Rule</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Current Active Rule Fields (Auto-filled or customizable) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Rule Category
                        </label>
                        <select
                            value={category}
                            onChange={(e) => {
                                setCategory(e.target.value);
                                emitChange({ category: e.target.value });
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
                        >
                            {GRAMMAR_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Rule Title
                        </label>
                        <input
                            type="text"
                            value={ruleLabel}
                            onChange={(e) => {
                                setRuleLabel(e.target.value);
                                emitChange({ ruleLabel: e.target.value });
                            }}
                            placeholder="e.g. Since vs. For (Present Perfect)"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Rule Guidance / Student Tip
                        </label>
                        <input
                            type="text"
                            value={ruleTip}
                            onChange={(e) => {
                                setRuleTip(e.target.value);
                                emitChange({ ruleTip: e.target.value });
                            }}
                            placeholder="e.g. Use 'since' for a specific point in time, and 'for' for a duration."
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Section 2: Sentence with Blank Slot */}
            <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Sentence (Use <code className="bg-slate-100 text-indigo-700 px-1 py-0.5 rounded font-mono font-bold">____</code> for the blank)
                </label>
                <input
                    type="text"
                    value={sentence}
                    onChange={(e) => {
                        setSentence(e.target.value);
                        emitChange({ sentence: e.target.value });
                    }}
                    placeholder="e.g. I have lived in this city ____ 2018."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:border-indigo-500 focus:outline-none font-medium transition-all"
                />
            </div>

            {/* Section 3: Contrasting Answer Options */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        3. Contrast Choices (Select the correct radio button)
                    </label>
                    {options.length < 4 && (
                        <button
                            type="button"
                            onClick={handleAddOption}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Choice</span>
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {options.map((opt, idx) => {
                        const isCorrect = correctIndex === idx;
                        return (
                            <div
                                key={idx}
                                className={`flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all ${
                                    isCorrect
                                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-100'
                                        : 'bg-white border-slate-200'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="correctOptionRadio"
                                    checked={isCorrect}
                                    onChange={() => {
                                        setCorrectIndex(idx);
                                        emitChange({ correctIndex: idx });
                                    }}
                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                                    placeholder={`Option ${idx + 1} (e.g. ${idx === 0 ? 'since' : 'for'})`}
                                    className="flex-1 px-2 py-1 text-sm bg-transparent border-b border-transparent focus:border-indigo-400 focus:outline-none font-semibold text-slate-800"
                                />
                                {options.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveOption(idx)}
                                        className="text-slate-400 hover:text-red-500 p-1"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Section 4: Explanation for Review */}
            <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    4. Explanation for Review Feedback (Optional)
                </label>
                <input
                    type="text"
                    value={explanation}
                    onChange={(e) => {
                        setExplanation(e.target.value);
                        emitChange({ explanation: e.target.value });
                    }}
                    placeholder="e.g. 'Since' is required here because 2018 is a specific starting point."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
            </div>

            {/* Section 5: Live Student Preview */}
            <div className="p-4 bg-slate-950 rounded-xl text-white space-y-3 border border-slate-800">
                <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
                    {t?.studentViewPreview || 'Live Student View Preview'}
                </div>

                {/* Top Grammar Rule Banner */}
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-900 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-700">
                            {category}
                        </span>
                        {ruleLabel && (
                            <span className="text-xs font-semibold text-slate-200">
                                {ruleLabel}
                            </span>
                        )}
                    </div>
                    {ruleTip && (
                        <div className="text-xs text-indigo-300 font-medium pt-0.5">
                            Rule: {ruleTip}
                        </div>
                    )}
                </div>

                {/* Sentence & Contrast Buttons */}
                <div className="text-base text-slate-100 font-medium py-1 leading-relaxed">
                    {sentence ? sentencePreview : <span className="text-slate-500 italic">Enter a sentence above...</span>}
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className="text-xs text-slate-400">Student choices:</span>
                    {options.filter(o => o.trim() !== '').map((opt, i) => (
                        <span
                            key={i}
                            className={`px-3 py-1 rounded-md text-xs font-bold border ${
                                i === correctIndex
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                    : 'bg-slate-900 text-slate-300 border-slate-700'
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
