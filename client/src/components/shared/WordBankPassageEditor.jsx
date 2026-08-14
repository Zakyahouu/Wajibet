import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Plus, X, HelpCircle, AlertCircle, BookOpen } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const parseWordBankPassage = (str) => {
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

const WordBankPassageEditor = ({ value, onChange }) => {
    const { t } = useLanguage();
    const textareaRef = useRef(null);

    const initialPassageText = typeof value === 'string'
        ? value
        : value?.passageText || (Array.isArray(value?.segments)
            ? value.segments.map(s => s.type === 'blank' ? `[${s.options?.[s.correctIndex] || ''}]` : s.value).join('')
            : '');

    const initialExtraDistractors = Array.isArray(value?.extraDistractors)
        ? value.extraDistractors
        : [];

    const [passageText, setPassageText] = useState(initialPassageText);
    const [extraDistractors, setExtraDistractors] = useState(initialExtraDistractors);
    const [distractorInput, setDistractorInput] = useState('');

    useEffect(() => {
        if (typeof value === 'string' && value !== passageText) {
            setPassageText(value);
        } else if (value && typeof value === 'object') {
            if (value.passageText !== undefined && value.passageText !== passageText) {
                setPassageText(value.passageText || '');
            }
            if (Array.isArray(value.extraDistractors) && JSON.stringify(value.extraDistractors) !== JSON.stringify(extraDistractors)) {
                setExtraDistractors(value.extraDistractors);
            }
        }
    }, [value]);

    const handlePassageChange = (newText) => {
        setPassageText(newText);
        onChange({ passageText: newText, extraDistractors });
    };

    const handleAddDistractor = () => {
        const trimmed = distractorInput.trim();
        if (!trimmed) return;
        if (extraDistractors.includes(trimmed)) {
            setDistractorInput('');
            return;
        }
        const updated = [...extraDistractors, trimmed];
        setExtraDistractors(updated);
        setDistractorInput('');
        onChange({ passageText, extraDistractors: updated });
    };

    const handleRemoveDistractor = (index) => {
        const updated = extraDistractors.filter((_, i) => i !== index);
        setExtraDistractors(updated);
        onChange({ passageText, extraDistractors: updated });
    };

    const handleWrapSelectionInBrackets = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        if (start === end) return;

        const selected = passageText.substring(start, end).trim();
        if (!selected) return;

        const newText = passageText.substring(0, start) + `[${selected}]` + passageText.substring(end);
        handlePassageChange(newText);
    };

    const segments = parseWordBankPassage(passageText);
    const bankWords = segments.filter(s => s.type === 'blank' && s.value.length > 0).map(s => s.value);
    const allBankPreview = [...bankWords, ...extraDistractors];

    return (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-teal-700 font-semibold text-sm">
                    <BookOpen className="w-4 h-4" />
                    <span>{t?.wordBankPassageEditor || 'Word Bank Passage Editor'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{t?.wordBankHelp || 'Wrap target words in brackets [word] or highlight text'}</span>
                </div>
            </div>

            {/* Passage Textarea & Action Bar */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                        {t?.passageText || 'Passage / Story'}
                    </label>
                    <button
                        type="button"
                        onClick={handleWrapSelectionInBrackets}
                        className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 font-medium text-xs rounded-md transition-colors flex items-center gap-1"
                    >
                        <Sparkles className="w-3 h-3" />
                        <span>{t?.turnSelectionIntoBlank || 'Make Selected Word a Blank'}</span>
                    </button>
                </div>
                <textarea
                    ref={textareaRef}
                    rows={4}
                    value={passageText}
                    onChange={(e) => handlePassageChange(e.target.value)}
                    placeholder="e.g. The [solar] system consists of the [Sun] and eight [planets] orbiting around it."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm leading-relaxed focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                />
            </div>

            {/* Extra Distractor Words (Optional Challenge) */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                        {t?.extraChallengeWords || 'Extra Challenge Words in Bank (Optional Distractors)'}
                    </label>
                    <span className="text-[11px] text-slate-400">
                        {t?.extraWordsNote || 'Added to the bank pool to test elimination'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={distractorInput}
                        onChange={(e) => setDistractorInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddDistractor();
                            }
                        }}
                        placeholder="Type a distractor word and press Enter..."
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={handleAddDistractor}
                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs rounded-md transition-colors flex items-center gap-1"
                    >
                        <Plus className="w-3 h-3" />
                        <span>{t?.addWord || 'Add'}</span>
                    </button>
                </div>

                {extraDistractors.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {extraDistractors.map((word, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-medium"
                            >
                                <span>{word}</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveDistractor(idx)}
                                    className="hover:text-red-600 focus:outline-none"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Live Word Bank Preview */}
            <div className="p-4 bg-slate-900 rounded-lg text-white space-y-3">
                <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-teal-400">
                        {t?.liveWordBankPreview || 'Student Word Bank Preview'}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                        {allBankPreview.length} {allBankPreview.length === 1 ? 'word' : 'words'} total
                    </div>
                </div>

                {allBankPreview.length === 0 ? (
                    <div className="text-slate-500 italic text-xs py-1">
                        {t?.noBankWordsPrompt || 'Add words in brackets [like this] to populate the word bank.'}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                        {allBankPreview.map((w, idx) => {
                            const isExtra = idx >= bankWords.length;
                            return (
                                <span
                                    key={idx}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm border ${
                                        isExtra
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                            : 'bg-teal-500/20 text-teal-200 border-teal-500/40'
                                    }`}
                                >
                                    {w} {isExtra && <span className="text-[9px] opacity-75 font-normal">(extra)</span>}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Warnings */}
            {bankWords.length === 0 && passageText.trim().length > 0 && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2.5 rounded-md text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{t?.noWordBankBlanksWarning || 'No bank words defined! Highlight words or wrap them in [brackets].'}</span>
                </div>
            )}
        </div>
    );
};

export default WordBankPassageEditor;
