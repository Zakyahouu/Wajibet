import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, X, HelpCircle, AlertCircle, BookOpen, Check, Layers } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Parses passage string into text and blank segments.
 */
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

/**
 * Splits plain passage text into clickable word tokens while preserving punctuation.
 */
const tokenizePassage = (plainText) => {
    if (!plainText) return [];
    const tokens = [];
    // Matches words (including contractions/hyphens) or whitespace/punctuation
    const regex = /([a-zA-Z0-9_\u0600-\u06FF\u00C0-\u024F]+)|([^\s\w\u0600-\u06FF\u00C0-\u024F]+|\s+)/gu;
    let match;
    let wordIndex = 0;

    while ((match = regex.exec(plainText)) !== null) {
        if (match[1] !== undefined) {
            tokens.push({
                id: 'tok_' + wordIndex,
                wordIndex: wordIndex++,
                isWord: true,
                value: match[1],
                raw: match[1]
            });
        } else if (match[2] !== undefined) {
            tokens.push({
                id: 'sym_' + Math.random().toString(36).substr(2, 6),
                isWord: false,
                value: match[2],
                raw: match[2]
            });
        }
    }

    return tokens;
};

/**
 * Reconstructs bracketed passage string from plain tokens and selected blank words
 */
const reconstructPassageString = (rawText, selectedWords) => {
    if (!rawText) return '';
    if (!selectedWords || selectedWords.length === 0) return rawText;

    let result = rawText;
    // Sort words by length descending so longer words are bracketed first without partial collisions
    const sorted = [...selectedWords].sort((a, b) => b.length - a.length);

    sorted.forEach((w) => {
        if (w && result.includes(w) && !result.includes(`[${w}]`)) {
            // Replace exact word boundary if possible, or direct occurrence
            const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordRegex = new RegExp(`(?<!\\[)\\b${escaped}\\b(?!\\])`, 'g');
            if (wordRegex.test(result)) {
                result = result.replace(wordRegex, `[${w}]`);
            } else {
                result = result.replace(w, `[${w}]`);
            }
        }
    });

    return result;
};

const WordBankPassageEditor = ({ value, onChange }) => {
    const { t } = useLanguage();

    const initialPassageText = typeof value === 'string'
        ? value
        : value?.passageText || (Array.isArray(value?.segments)
            ? value.segments.map(s => s.type === 'blank' ? `[${s.options?.[s.correctIndex] || ''}]` : s.value).join('')
            : 'The astronomer looked through the [telescope] and discovered a new [planet] orbiting the distant [star].');

    const initialExtraDistractors = Array.isArray(value?.extraDistractors)
        ? value.extraDistractors
        : [];

    // Clean plain text without brackets
    const cleanInitialText = initialPassageText.replace(/\[(.*?)\]/g, '$1');
    const initialSegments = parseWordBankPassage(initialPassageText);
    const initialBlanks = initialSegments.filter(s => s.type === 'blank').map(s => s.value);

    const [plainText, setPlainText] = useState(cleanInitialText);
    const [selectedWords, setSelectedWords] = useState(initialBlanks);
    const [extraDistractors, setExtraDistractors] = useState(initialExtraDistractors);
    const [distractorInput, setDistractorInput] = useState('');

    useEffect(() => {
        if (typeof value === 'string') {
            const clean = value.replace(/\[(.*?)\]/g, '$1');
            const segs = parseWordBankPassage(value);
            const blanks = segs.filter(s => s.type === 'blank').map(s => s.value);
            setPlainText(clean);
            setSelectedWords(blanks);
        } else if (value && typeof value === 'object') {
            if (value.passageText !== undefined) {
                const clean = (value.passageText || '').replace(/\[(.*?)\]/g, '$1');
                const segs = parseWordBankPassage(value.passageText || '');
                const blanks = segs.filter(s => s.type === 'blank').map(s => s.value);
                setPlainText(clean);
                setSelectedWords(blanks);
            }
            if (Array.isArray(value.extraDistractors)) {
                setExtraDistractors(value.extraDistractors);
            }
        }
    }, [value]);

    const emitUpdate = (newText, newSelected, newDistractors) => {
        const bracketed = reconstructPassageString(newText, newSelected);
        onChange({ passageText: bracketed, extraDistractors: newDistractors });
    };

    const handleTextChange = (e) => {
        const newText = e.target.value;
        setPlainText(newText);
        // Filter out selected words that no longer exist in the new text
        const validBlanks = selectedWords.filter(w => newText.includes(w));
        setSelectedWords(validBlanks);
        emitUpdate(newText, validBlanks, extraDistractors);
    };

    const handleToggleWord = (wordVal) => {
        let updated;
        if (selectedWords.includes(wordVal)) {
            updated = selectedWords.filter(w => w !== wordVal);
        } else {
            updated = [...selectedWords, wordVal];
        }
        setSelectedWords(updated);
        emitUpdate(plainText, updated, extraDistractors);
    };

    const handleAddDistractor = () => {
        const trimmed = distractorInput.trim();
        if (!trimmed) return;
        if (extraDistractors.includes(trimmed) || selectedWords.includes(trimmed)) {
            setDistractorInput('');
            return;
        }
        const updated = [...extraDistractors, trimmed];
        setExtraDistractors(updated);
        setDistractorInput('');
        emitUpdate(plainText, selectedWords, updated);
    };

    const handleRemoveDistractor = (index) => {
        const updated = extraDistractors.filter((_, i) => i !== index);
        setExtraDistractors(updated);
        emitUpdate(plainText, selectedWords, updated);
    };

    const handleLoadSampleStory = () => {
        const sample = 'The astronomer looked through the telescope and discovered a new planet orbiting the distant star.';
        const sampleBlanks = ['telescope', 'planet', 'star'];
        setPlainText(sample);
        setSelectedWords(sampleBlanks);
        setExtraDistractors([]);
        emitUpdate(sample, sampleBlanks, []);
    };

    const tokens = tokenizePassage(plainText);
    const bracketedPassage = reconstructPassageString(plainText, selectedWords);
    const segments = parseWordBankPassage(bracketedPassage);
    const allBankWords = [...selectedWords, ...extraDistractors];

    return (
        <div className="space-y-5 bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>{t?.wordBankPassageEditor || 'Word Bank Passage Builder'}</span>
                </div>
                <button
                    type="button"
                    onClick={handleLoadSampleStory}
                    className="text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 font-medium"
                >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Load Sample Story</span>
                </button>
            </div>

            {/* Word Bank Pool Preview Card */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-purple-600" />
                        <span>Shared Word Bank Pool ({allBankWords.length} words)</span>
                    </span>
                    <span className="text-[11px] text-purple-700 font-medium">
                        {selectedWords.length} from story{extraDistractors.length > 0 ? ` + ${extraDistractors.length} extra distractors` : ''}
                    </span>
                </div>

                {allBankWords.length === 0 ? (
                    <div className="text-xs text-purple-400 italic py-1">
                        Click words in your story below or add extra distractors to populate the Word Bank.
                    </div>
                ) : (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                        {selectedWords.map((w, idx) => (
                            <span
                                key={`blank_${idx}`}
                                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1"
                            >
                                <span>{w}</span>
                                <span className="text-[10px] bg-purple-700 px-1 rounded text-purple-200">Story Blank</span>
                            </span>
                        ))}
                        {extraDistractors.map((d, idx) => (
                            <span
                                key={`dist_${idx}`}
                                className="px-3 py-1.5 bg-amber-500 text-slate-950 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5"
                            >
                                <span>{d}</span>
                                <span className="text-[10px] bg-amber-600 text-amber-950 px-1 rounded">Distractor</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveDistractor(idx)}
                                    className="hover:text-red-700 p-0.5"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Step 1: Plain Textarea Input */}
            <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    1. Write or Paste Your Story (Normal Plain Text)
                </label>
                <textarea
                    value={plainText}
                    onChange={handleTextChange}
                    rows={3}
                    placeholder="Type or paste your story here in plain English..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all resize-y leading-relaxed"
                />
            </div>

            {/* Live Warning if text typed but 0 words banked */}
            {plainText.trim().length > 0 && selectedWords.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>No words banked yet — tap words below to create blanks.</span>
                </div>
            )}

            {/* Step 2: Interactive Click-to-Bank Tokenizer */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span>2. Click any words in your passage to put them into the Word Bank:</span>
                    </span>
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {selectedWords.length} {selectedWords.length === 1 ? 'word' : 'words'} banked
                    </span>
                </div>

                {tokens.length === 0 ? (
                    <div className="text-xs text-slate-400 italic py-2">
                        Type a story above to click words into the bank.
                    </div>
                ) : (
                    <div className="p-4 bg-white border border-slate-200 rounded-xl leading-loose flex flex-wrap items-center gap-y-2 shadow-inner">
                        {tokens.map((tok) => {
                            if (!tok.isWord) {
                                return (
                                    <span key={tok.id} className="text-slate-600 select-none whitespace-pre">
                                        {tok.value}
                                    </span>
                                );
                            }

                            const isSelected = selectedWords.includes(tok.value);
                            return (
                                <button
                                    key={tok.id}
                                    type="button"
                                    onClick={() => handleToggleWord(tok.value)}
                                    className={`mx-0.5 px-2.5 py-1 rounded-lg text-sm font-semibold transition-all transform active:scale-95 border ${
                                        isSelected
                                            ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-200'
                                            : 'bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-800 border-slate-200'
                                    }`}
                                >
                                    <span>{tok.value}</span>
                                    {isSelected && <Check className="w-3 h-3 inline-block ml-1" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Step 3: Extra Challenge Words (Tag Input) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    3. Extra Challenge Words (Optional Pool Distractors)
                </label>
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
                        placeholder="Type extra word (e.g. comet) and press Enter..."
                        className="flex-1 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:border-indigo-500 focus:outline-none transition-all"
                    />
                    <button
                        type="button"
                        onClick={handleAddDistractor}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Distractor</span>
                    </button>
                </div>
            </div>

            {/* Live Student Game Preview */}
            <div className="p-4 bg-slate-950 rounded-xl text-white space-y-2 border border-slate-800">
                <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
                        {t?.studentViewPreview || 'Live Student View Preview'}
                    </div>
                    <div className="text-xs text-slate-400">
                        Word Bank has {allBankWords.length} chips for {selectedWords.length} blanks
                    </div>
                </div>

                {segments.length === 0 ? (
                    <div className="text-slate-500 italic text-sm py-2">
                        Story preview will appear here.
                    </div>
                ) : (
                    <div className="text-slate-200 text-base leading-relaxed py-1">
                        {segments.map((seg, idx) => {
                            if (seg.type === 'blank') {
                                return (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center px-3 py-1 mx-1 bg-purple-500 text-white font-bold rounded-md shadow border border-purple-400 text-sm"
                                    >
                                        [ {seg.value} ]
                                    </span>
                                );
                            }
                            return <span key={idx}>{seg.value}</span>;
                        })}
                    </div>
                )}
            </div>

            {/* Validation Feedback */}
            {selectedWords.length === 0 && plainText.trim().length > 0 && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                    <span>Please click at least one word in your passage above to add it to the Word Bank!</span>
                </div>
            )}
        </div>
    );
};

export default WordBankPassageEditor;
