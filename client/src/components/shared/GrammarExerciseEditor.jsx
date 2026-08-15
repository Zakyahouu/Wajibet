import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Plus, Trash2, CheckCircle2, HelpCircle, Layers, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// Helper to get all teacher-created rules stored during this session/browser
const getSavedTeacherRules = () => {
    try {
        const stored = localStorage.getItem('wajibet_teacher_custom_grammar_rules');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        // ignore
    }
    return [];
};

const saveTeacherRuleToStorage = (ruleName, ruleTip) => {
    if (!ruleName || !ruleName.trim()) return;
    try {
        const current = getSavedTeacherRules();
        const filtered = current.filter(r => r.ruleLabel.toLowerCase() !== ruleName.trim().toLowerCase());
        const updated = [{ ruleLabel: ruleName.trim(), ruleTip: (ruleTip || '').trim() }, ...filtered].slice(0, 30);
        localStorage.setItem('wajibet_teacher_custom_grammar_rules', JSON.stringify(updated));
    } catch (e) {
        // ignore
    }
};

const GrammarExerciseEditor = ({ value, onChange }) => {
    const { t } = useLanguage();
    const sentenceInputRef = useRef(null);

    const [ruleLabel, setRuleLabel] = useState(value?.ruleLabel || '');
    const [ruleTip, setRuleTip] = useState(value?.ruleTip || '');
    const [sentence, setSentence] = useState(value?.sentence || '');
    const [options, setOptions] = useState(Array.isArray(value?.options) && value.options.length >= 2 ? value.options : ['', '']);
    const [correctIndex, setCorrectIndex] = useState(Number.isInteger(value?.correctIndex) ? value.correctIndex : 0);
    const [explanation, setExplanation] = useState(value?.explanation || '');

    // List of teacher's created rules in this session
    const [savedRules, setSavedRules] = useState(getSavedTeacherRules);

    useEffect(() => {
        if (value && typeof value === 'object') {
            if (value.ruleLabel !== undefined && value.ruleLabel !== ruleLabel) {
                setRuleLabel(value.ruleLabel);
            }
            if (value.ruleTip !== undefined && value.ruleTip !== ruleTip) {
                setRuleTip(value.ruleTip);
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
            if (value.explanation !== undefined && value.explanation !== explanation) {
                setExplanation(value.explanation);
            }
        }
    }, [value]);

    const emitChange = (updates = {}) => {
        const finalRuleLabel = updates.ruleLabel !== undefined ? updates.ruleLabel : ruleLabel;
        const finalRuleTip = updates.ruleTip !== undefined ? updates.ruleTip : ruleTip;

        // Auto-save teacher's created rule into recent storage
        if (finalRuleLabel && finalRuleLabel.trim()) {
            saveTeacherRuleToStorage(finalRuleLabel, finalRuleTip);
            setSavedRules(getSavedTeacherRules());
        }

        const payload = {
            category: 'Grammar Rule',
            ruleLabel: finalRuleLabel,
            ruleTip: finalRuleTip,
            sentence: updates.sentence !== undefined ? updates.sentence : sentence,
            options: updates.options || options,
            correctIndex: updates.correctIndex !== undefined ? updates.correctIndex : correctIndex,
            explanation: updates.explanation !== undefined ? updates.explanation : explanation
        };
        onChange(payload);
    };

    const handleSelectSavedRule = (selectedLabel) => {
        if (!selectedLabel) return;
        const found = savedRules.find(r => r.ruleLabel === selectedLabel);
        if (found) {
            setRuleLabel(found.ruleLabel);
            setRuleTip(found.ruleTip || '');
            emitChange({ ruleLabel: found.ruleLabel, ruleTip: found.ruleTip || '' });
        } else {
            setRuleLabel(selectedLabel);
            emitChange({ ruleLabel: selectedLabel });
        }
    };

    const handleInsertBlank = () => {
        const input = sentenceInputRef.current;
        if (!input) {
            const next = sentence ? sentence + ' ____' : '____';
            setSentence(next);
            emitChange({ sentence: next });
            return;
        }

        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const selectedText = sentence.substring(start, end).trim();

        let updatedSentence = '';
        if (start !== end) {
            // Replace selected word with ____
            updatedSentence = sentence.substring(0, start) + '____' + sentence.substring(end);
            // If Choice 1 is empty and text was selected, optionally pre-fill it into Choice 1
            if (selectedText && (!options[0] || options[0].trim() === '')) {
                const nextOptions = [...options];
                nextOptions[0] = selectedText;
                setOptions(nextOptions);
                emitChange({ sentence: updatedSentence, options: nextOptions });
            } else {
                emitChange({ sentence: updatedSentence });
            }
        } else {
            // Insert ____ at cursor position
            updatedSentence = sentence.substring(0, start) + ' ____ ' + sentence.substring(start);
            emitChange({ sentence: updatedSentence });
        }

        setSentence(updatedSentence);

        // Keep focus on input
        setTimeout(() => {
            input.focus();
            const newPos = start + 5;
            input.setSelectionRange(newPos, newPos);
        }, 30);
    };

    const handleOptionChange = (idx, val) => {
        const next = [...options];
        next[idx] = val;
        setOptions(next);
        emitChange({ options: next });
    };

    const handleAddOption = () => {
        if (options.length >= 5) return;
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

    const sentencePreview = sentence.replace(/____/g, `[ ${options[correctIndex] || '?'} ]`);

    return (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <BookOpen className="w-4 h-4" />
                    <span>{t?.grammarExerciseEditor || 'Grammar Exercise'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Type your rule name, write the sentence, and insert the blank slot.</span>
                </div>
            </div>

            {/* Step 1: Teacher's Grammar Rule & Tip */}
            <div className="space-y-2.5 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        1. Grammar Rule / Topic
                    </label>
                    {savedRules.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            <select
                                onChange={(e) => handleSelectSavedRule(e.target.value)}
                                defaultValue=""
                                className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
                            >
                                <option value="" disabled>-- Pick from your created rules ({savedRules.length}) --</option>
                                {savedRules.map((r, i) => (
                                    <option key={i} value={r.ruleLabel}>{r.ruleLabel}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <input
                            type="text"
                            value={ruleLabel}
                            onChange={(e) => {
                                setRuleLabel(e.target.value);
                                emitChange({ ruleLabel: e.target.value });
                            }}
                            placeholder="Type rule name (e.g. Accord du participe passé, Por vs Para, حروف الجر, Since vs For)..."
                            className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm font-medium focus:border-indigo-500 focus:outline-none transition-all shadow-sm"
                        />
                    </div>

                    <div>
                        <input
                            type="text"
                            value={ruleTip}
                            onChange={(e) => {
                                setRuleTip(e.target.value);
                                emitChange({ ruleTip: e.target.value });
                            }}
                            placeholder="Optional rule tip or explanation for students..."
                            className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:border-indigo-500 focus:outline-none transition-all shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Step 2: Sentence Input with "+ Insert Blank" Button */}
            <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        2. Sentence
                    </label>
                    <button
                        type="button"
                        onClick={handleInsertBlank}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                        title="Click to insert ____ at the cursor position or replace selected text"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Insert Blank ( ____ )</span>
                    </button>
                </div>

                <input
                    ref={sentenceInputRef}
                    type="text"
                    value={sentence}
                    onChange={(e) => {
                        setSentence(e.target.value);
                        emitChange({ sentence: e.target.value });
                    }}
                    placeholder="Type sentence here and click '+ Insert Blank' where you want the missing word..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
            </div>

            {/* Step 3: Contrast Choices */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        3. Contrast Choices (Select the radio button for the correct answer)
                    </label>
                    {options.length < 5 && (
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

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {options.map((opt, idx) => {
                        const isCorrect = correctIndex === idx;
                        return (
                            <div
                                key={idx}
                                className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                                    isCorrect
                                        ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-100 shadow-sm'
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
                        Live Student Preview
                    </span>
                    {ruleLabel && (
                        <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
                            {ruleLabel}
                        </span>
                    )}
                </div>

                {ruleTip && (
                    <div className="text-xs text-indigo-900 bg-indigo-50/60 p-2 rounded-lg border border-indigo-100 font-medium">
                        Tip: {ruleTip}
                    </div>
                )}

                <div className="text-base font-semibold text-slate-800 py-1">
                    {sentence ? sentencePreview : <span className="text-slate-400 italic font-normal">Sentence preview will appear here...</span>}
                </div>

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">Student choices:</span>
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
