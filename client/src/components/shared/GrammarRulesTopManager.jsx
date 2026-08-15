import React, { useState } from 'react';
import { BookOpen, Plus, Trash2, HelpCircle, X, Tag } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const GrammarRulesTopManager = ({ rules = [], onRulesChange }) => {
    const { t } = useLanguage();
    const [newTitle, setNewTitle] = useState('');
    const [newTip, setNewTip] = useState('');

    const handleAddRule = (e) => {
        if (e) e.preventDefault();
        const trimmedTitle = newTitle.trim();
        if (!trimmedTitle) return;

        // Check if duplicate title exists
        const exists = rules.some(r => r.ruleLabel.toLowerCase() === trimmedTitle.toLowerCase());
        if (exists) {
            // Update tip if already exists
            const updated = rules.map(r => r.ruleLabel.toLowerCase() === trimmedTitle.toLowerCase()
                ? { ...r, ruleTip: newTip.trim() }
                : r
            );
            onRulesChange(updated);
        } else {
            const newRule = {
                id: `rule_${Date.now()}_${rules.length + 1}`,
                ruleLabel: trimmedTitle,
                ruleTip: newTip.trim()
            };
            onRulesChange([...rules, newRule]);
        }

        setNewTitle('');
        setNewTip('');
    };

    const handleRemoveRule = (ruleIdOrIdx) => {
        const next = rules.filter((r, idx) => (r.id ? r.id !== ruleIdOrIdx : idx !== ruleIdOrIdx));
        onRulesChange(next);
    };

    const handleEditRuleClick = (r) => {
        setNewTitle(r.ruleLabel);
        setNewTip(r.ruleTip || '');
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3 mb-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>{t?.grammarRulesTopTitle || 'Grammar Rules & Topics Pool'}</span>
                    <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-semibold border border-indigo-100">
                        {rules.filter(r => r.ruleLabel && r.ruleLabel.trim()).length} defined
                    </span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Add rules here once; select them from the dropdown in each question below.</span>
                </div>
            </div>

            {/* Quick 1-Row Add Rule Bar */}
            <form onSubmit={handleAddRule} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <div className="md:col-span-5">
                    <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Rule title (e.g. Past Simple vs Present Perfect, Accord du participe passé)..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs font-medium focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                    />
                </div>

                <div className="md:col-span-5">
                    <input
                        type="text"
                        value={newTip}
                        onChange={(e) => setNewTip(e.target.value)}
                        placeholder="Optional student tip (e.g. Use Past Simple for completed past actions)..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                    />
                </div>

                <div className="md:col-span-2">
                    <button
                        type="submit"
                        disabled={!newTitle.trim()}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                            newTitle.trim()
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        }`}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Rule</span>
                    </button>
                </div>
            </form>

            {/* Compact Defined Rules Tags List (Scrollable, takes minimal space even with 20 rules!) */}
            {rules.filter(r => r.ruleLabel && r.ruleLabel.trim()).length > 0 && (
                <div className="pt-1">
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-50/70 border border-slate-200 rounded-lg">
                        {rules.filter(r => r.ruleLabel && r.ruleLabel.trim()).map((rule, idx) => (
                            <span
                                key={rule.id || idx}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 hover:border-indigo-300 rounded-full text-xs text-slate-800 shadow-sm transition-all group"
                            >
                                <Tag className="w-3 h-3 text-indigo-500" />
                                <span
                                    onClick={() => handleEditRuleClick(rule)}
                                    className="cursor-pointer font-semibold text-slate-800 hover:text-indigo-600"
                                    title="Click to edit in input"
                                >
                                    {rule.ruleLabel}
                                </span>
                                {rule.ruleTip && (
                                    <span className="text-[11px] text-slate-500 max-w-[150px] truncate" title={rule.ruleTip}>
                                        ({rule.ruleTip})
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveRule(rule.id || idx)}
                                    className="text-slate-400 hover:text-red-500 ml-0.5 p-0.5 rounded-full hover:bg-red-50 transition-colors"
                                    title="Remove Rule"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GrammarRulesTopManager;
