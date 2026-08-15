import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Plus, Trash2, CheckCircle2, HelpCircle, Layers, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// Helper to get all teacher-created rules stored during this session/browser
const getSavedTeacherRules = () => {
    try {
        const stored = localStorage.getItem('wajibet_teacher_custom_grammar_rules');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return parsed.filter(r => r && typeof r.ruleLabel === 'string' && r.ruleLabel.trim().length >= 2);
            }
        }
    } catch (e) {
        // ignore
    }
    return [];
};

// Saves a completed rule to storage
const saveTeacherRuleToStorage = (ruleName, ruleTip) => {
    const trimmed = (ruleName || '').trim();
    if (!trimmed || trimmed.length < 2) return;

    try {
        const current = getSavedTeacherRules();
        const filtered = current.filter(r => {
            const existing = r.ruleLabel.toLowerCase();
            const target = trimmed.toLowerCase();
            return existing !== target && !target.startsWith(existing);
        });

        const updated = [{ ruleLabel: trimmed, ruleTip: (ruleTip || '').trim() }, ...filtered].slice(0, 30);
        localStorage.setItem('wajibet_teacher_custom_grammar_rules', JSON.stringify(updated));
    } catch (e) {
        // ignore
    }
};

const countSentenceBlanks = (text) => {
    if (!text || typeof text !== 'string') return 0;
    const matches = text.match(/____+|___|\[(.*?)\]/g);
    return matches ? matches.length : 0;
};

const GrammarExerciseEditor = ({ value, onChange }) => {
    const { t } = useLanguage();
    const sentenceInputRef = useRef(null);

    const [ruleLabel, setRuleLabel] = useState(value?.ruleLabel || '');
    const [ruleTip, setRuleTip] = useState(value?.ruleTip || '');
    const [sentence, setSentence] = useState(value?.sentence || '');
    const [explanation, setExplanation] = useState(value?.explanation || '');

    // Blanks structure: array of { options: string[], correctIndex: number }
    const initialBlanks = Array.isArray(value?.blanks) && value.blanks.length > 0
        ? value.blanks
        : [
            {
                options: Array.isArray(value?.options) && value.options.length >= 2 ? value.options : ['', ''],
                correctIndex: Number.isInteger(value?.correctIndex) ? value.correctIndex : 0
            }
        ];

    const [blanks, setBlanks] = useState(initialBlanks);
    const [activeBlankTab, setActiveBlankTab] = useState(0);

    // List of teacher's created rules in this session
    const [savedRules, setSavedRules] = useState(getSavedTeacherRules);

    // Synchronize number of blank choice configs with the number of blanks in the sentence
    const detectedBlankCount = Math.max(1, countSentenceBlanks(sentence));

    useEffect(() => {
        setBlanks((prev) => {
            if (prev.length === detectedBlankCount) return prev;
            const updated = [...prev];
            while (updated.length < detectedBlankCount) {
                updated.push({ options: ['', ''], correctIndex: 0 });
            }
            return updated.slice(0, detectedBlankCount);
        });
        if (activeBlankTab >= detectedBlankCount) {
            setActiveBlankTab(0);
        }
    }, [detectedBlankCount]);

    useEffect(() => {
        if (value && typeof value === 'object') {
            if (value.ruleLabel !== undefined && value.ruleLabel !== ruleLabel) setRuleLabel(value.ruleLabel);
            if (value.ruleTip !== undefined && value.ruleTip !== ruleTip) setRuleTip(value.ruleTip);
            if (value.sentence !== undefined && value.sentence !== sentence) setSentence(value.sentence);
            if (Array.isArray(value.blanks) && value.blanks.length > 0) {
                setBlanks(value.blanks);
            } else if (Array.isArray(value.options)) {
                setBlanks([{
                    options: value.options,
                    correctIndex: Number.isInteger(value.correctIndex) ? value.correctIndex : 0
                }]);
            }
            if (value.explanation !== undefined && value.explanation !== explanation) setExplanation(value.explanation);
        }
    }, [value]);

    const emitChange = (updates = {}) => {
        const finalRuleLabel = updates.ruleLabel !== undefined ? updates.ruleLabel : ruleLabel;
        const finalRuleTip = updates.ruleTip !== undefined ? updates.ruleTip : ruleTip;
        const finalSentence = updates.sentence !== undefined ? updates.sentence : sentence;
        const finalBlanks = updates.blanks !== undefined ? updates.blanks : blanks;
        const finalExplanation = updates.explanation !== undefined ? updates.explanation : explanation;

        const payload = {
            category: 'Grammar Rule',
            ruleLabel: finalRuleLabel,
            ruleTip: finalRuleTip,
            sentence: finalSentence,
            blanks: finalBlanks,
            // Backwards compatibility for single-blank readers
            options: finalBlanks[0]?.options || ['', ''],
            correctIndex: finalBlanks[0]?.correctIndex || 0,
            explanation: finalExplanation
        };
        onChange(payload);
    };

    const handleRuleBlur = () => {
        if (ruleLabel && ruleLabel.trim().length >= 2) {
            saveTeacherRuleToStorage(ruleLabel, ruleTip);
            setSavedRules(getSavedTeacherRules());
        }
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
        const currentBlankIndex = countSentenceBlanks(sentence.substring(0, start));

        if (start !== end) {
            updatedSentence = sentence.substring(0, start) + '____' + sentence.substring(end);
            // Pre-fill selected text into Choice 1 of that blank if empty
            if (selectedText) {
                const nextBlanks = [...blanks];
                if (!nextBlanks[currentBlankIndex]) {
                    nextBlanks[currentBlankIndex] = { options: ['', ''], correctIndex: 0 };
                }
                const bOpts = [...(nextBlanks[currentBlankIndex].options || ['', ''])];
                if (!bOpts[0] || bOpts[0].trim() === '') {
                    bOpts[0] = selectedText;
                    nextBlanks[currentBlankIndex] = { ...nextBlanks[currentBlankIndex], options: bOpts };
                    setBlanks(nextBlanks);
                    emitChange({ sentence: updatedSentence, blanks: nextBlanks });
                } else {
                    emitChange({ sentence: updatedSentence });
                }
            } else {
                emitChange({ sentence: updatedSentence });
            }
        } else {
            updatedSentence = sentence.substring(0, start) + ' ____ ' + sentence.substring(start);
            emitChange({ sentence: updatedSentence });
        }

        setSentence(updatedSentence);

        setTimeout(() => {
            input.focus();
            const newPos = start + 5;
            input.setSelectionRange(newPos, newPos);
        }, 30);
    };

    const handleOptionChange = (blankIdx, optIdx, val) => {
        const nextBlanks = [...blanks];
        if (!nextBlanks[blankIdx]) nextBlanks[blankIdx] = { options: ['', ''], correctIndex: 0 };
        const nextOpts = [...nextBlanks[blankIdx].options];
        nextOpts[optIdx] = val;
        nextBlanks[blankIdx] = { ...nextBlanks[blankIdx], options: nextOpts };
        setBlanks(nextBlanks);
        emitChange({ blanks: nextBlanks });
    };

    const handleSetCorrectIndex = (blankIdx, optIdx) => {
        const nextBlanks = [...blanks];
        if (!nextBlanks[blankIdx]) nextBlanks[blankIdx] = { options: ['', ''], correctIndex: 0 };
        nextBlanks[blankIdx] = { ...nextBlanks[blankIdx], correctIndex: optIdx };
        setBlanks(nextBlanks);
        emitChange({ blanks: nextBlanks });
    };

    const handleAddOptionToBlank = (blankIdx) => {
        const nextBlanks = [...blanks];
        if (!nextBlanks[blankIdx]) nextBlanks[blankIdx] = { options: ['', ''], correctIndex: 0 };
        if (nextBlanks[blankIdx].options.length >= 5) return;
        const nextOpts = [...nextBlanks[blankIdx].options, ''];
        nextBlanks[blankIdx] = { ...nextBlanks[blankIdx], options: nextOpts };
        setBlanks(nextBlanks);
        emitChange({ blanks: nextBlanks });
    };

    const handleRemoveOptionFromBlank = (blankIdx, optIdx) => {
        const nextBlanks = [...blanks];
        if (!nextBlanks[blankIdx] || nextBlanks[blankIdx].options.length <= 2) return;
        const nextOpts = nextBlanks[blankIdx].options.filter((_, i) => i !== optIdx);
        let nextCorrect = nextBlanks[blankIdx].correctIndex;
        if (nextCorrect === optIdx) nextCorrect = 0;
        else if (nextCorrect > optIdx) nextCorrect -= 1;
        nextBlanks[blankIdx] = { options: nextOpts, correctIndex: nextCorrect };
        setBlanks(nextBlanks);
        emitChange({ blanks: nextBlanks });
    };

    // Render interactive preview of sentence with blanks replaced
    const renderPreviewSentence = () => {
        if (!sentence) return <span className="text-slate-400 italic font-normal">Sentence preview will appear here...</span>;
        const parts = [];
        const regex = /____+|___|\[(.*?)\]/g;
        let lastIdx = 0;
        let match;
        let bIdx = 0;

        while ((match = regex.exec(sentence)) !== null) {
            if (match.index > lastIdx) {
                parts.push(<span key={`t_${lastIdx}`}>{sentence.substring(lastIdx, match.index)}</span>);
            }
            const b = blanks[bIdx];
            const correctWord = b?.options?.[b?.correctIndex] || `Blank #${bIdx + 1}`;
            parts.push(
                <span
                    key={`b_${bIdx}`}
                    className="inline-flex items-center px-2.5 py-0.5 mx-1 bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold rounded-md text-sm"
                >
                    [ {correctWord} ]
                </span>
            );
            bIdx++;
            lastIdx = regex.lastIndex;
        }

        if (lastIdx < sentence.length) {
            parts.push(<span key={`t_${lastIdx}`}>{sentence.substring(lastIdx)}</span>);
        }

        return parts;
    };

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
                    <span>Type your rule name, write the sentence, and configure choices for each blank.</span>
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
                            onBlur={handleRuleBlur}
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
                            onBlur={handleRuleBlur}
                            placeholder="Optional rule tip or explanation for students..."
                            className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:border-indigo-500 focus:outline-none transition-all shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Step 2: Sentence Input with "+ Insert Blank" Button */}
            <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                            2. Sentence
                        </label>
                        <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                            {detectedBlankCount} {detectedBlankCount === 1 ? 'blank slot' : 'blank slots'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleInsertBlank}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                        title="Click to insert ____ at cursor or replace highlighted text"
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
                    placeholder="Type sentence and click '+ Insert Blank' wherever you want a missing word..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
            </div>

            {/* Step 3: Contrast Choices (Per Blank) */}
            <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        3. Contrast Choices for Blanks
                    </label>

                    {/* Blank Selector Tabs if multiple blanks exist */}
                    {detectedBlankCount > 1 && (
                        <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                            {Array.from({ length: detectedBlankCount }).map((_, bIdx) => (
                                <button
                                    key={bIdx}
                                    type="button"
                                    onClick={() => setActiveBlankTab(bIdx)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                        activeBlankTab === bIdx
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    Blank #{bIdx + 1}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Choices for the active blank */}
                {Array.from({ length: detectedBlankCount }).map((_, bIdx) => {
                    if (detectedBlankCount > 1 && activeBlankTab !== bIdx) return null;

                    const curBlank = blanks[bIdx] || { options: ['', ''], correctIndex: 0 };
                    const curOptions = curBlank.options || ['', ''];
                    const curCorrect = curBlank.correctIndex || 0;

                    return (
                        <div key={bIdx} className="space-y-2.5">
                            {detectedBlankCount > 1 && (
                                <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                                    <span>Configuring Choices for Blank #{bIdx + 1}</span>
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500">
                                    Select the radio button for the correct answer:
                                </span>
                                {curOptions.length < 5 && (
                                    <button
                                        type="button"
                                        onClick={() => handleAddOptionToBlank(bIdx)}
                                        className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add Choice to Blank #{bIdx + 1}</span>
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                {curOptions.map((opt, optIdx) => {
                                    const isCorrect = curCorrect === optIdx;
                                    return (
                                        <div
                                            key={optIdx}
                                            className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                                                isCorrect
                                                    ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-100 shadow-sm'
                                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name={`grammarCorrectRadio_${bIdx}`}
                                                checked={isCorrect}
                                                onChange={() => handleSetCorrectIndex(bIdx, optIdx)}
                                                className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer ml-1"
                                            />
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={(e) => handleOptionChange(bIdx, optIdx, e.target.value)}
                                                placeholder={`Choice ${optIdx + 1}`}
                                                className="flex-1 px-2 py-1 text-sm bg-transparent border-none outline-none font-semibold text-slate-800"
                                            />
                                            {curOptions.length > 2 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveOptionFromBlank(bIdx, optIdx)}
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
                    );
                })}
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

                <div className="text-base font-semibold text-slate-800 py-1 leading-relaxed">
                    {renderPreviewSentence()}
                </div>

                <div className="flex items-center gap-3 pt-1 flex-wrap text-xs text-slate-600">
                    {blanks.map((b, bIdx) => (
                        <div key={bIdx} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                            <span className="font-bold text-slate-500">Blank #{bIdx + 1}:</span>
                            {b.options.filter(o => o.trim() !== '').map((opt, i) => (
                                <span
                                    key={i}
                                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                                        i === b.correctIndex
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-100 text-slate-700'
                                    }`}
                                >
                                    {opt} {i === b.correctIndex && '✓'}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default GrammarExerciseEditor;
