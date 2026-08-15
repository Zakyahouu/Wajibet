import React from 'react';
import { BookOpen, Plus, Trash2, HelpCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const GrammarRulesTopManager = ({ rules = [], onRulesChange }) => {
    const { t } = useLanguage();

    const handleRuleFieldChange = (idx, field, val) => {
        const next = [...rules];
        if (!next[idx]) next[idx] = { id: `rule_${Date.now()}_${idx}`, ruleLabel: '', ruleTip: '' };
        next[idx] = { ...next[idx], [field]: val };
        onRulesChange(next);
    };

    const handleAddRule = () => {
        const newRule = {
            id: `rule_${Date.now()}_${rules.length + 1}`,
            ruleLabel: '',
            ruleTip: ''
        };
        onRulesChange([...rules, newRule]);
    };

    const handleRemoveRule = (idx) => {
        if (rules.length <= 1) return;
        const next = rules.filter((_, i) => i !== idx);
        onRulesChange(next);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4 mb-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>{t?.grammarRulesTopTitle || '1. Grammar Rules / Topics for this Game'}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Define the rules/topics once here; then simply select them in each question below.</span>
                </div>
            </div>

            {/* Rules list */}
            <div className="space-y-3">
                {rules.map((rule, idx) => (
                    <div
                        key={rule.id || idx}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 hover:border-slate-300 transition-colors"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                Rule #{idx + 1}
                            </span>
                            {rules.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveRule(idx)}
                                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                    title="Remove Rule"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-5">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Rule / Topic Title
                                </label>
                                <input
                                    type="text"
                                    value={rule.ruleLabel || ''}
                                    onChange={(e) => handleRuleFieldChange(idx, 'ruleLabel', e.target.value)}
                                    placeholder="e.g. Past Simple vs Present Perfect, Accord du participe passé, Por vs Para..."
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-medium focus:border-indigo-500 focus:outline-none transition-all shadow-sm"
                                />
                            </div>

                            <div className="md:col-span-7">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Rule Tip / Guidance (Shown to students)
                                </label>
                                <input
                                    type="text"
                                    value={rule.ruleTip || ''}
                                    onChange={(e) => handleRuleFieldChange(idx, 'ruleTip', e.target.value)}
                                    placeholder="e.g. Use Past Simple for completed past actions and Present Perfect for ongoing..."
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-indigo-500 focus:outline-none transition-all shadow-sm"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Rule Button */}
            <div className="flex justify-start pt-1">
                <button
                    type="button"
                    onClick={handleAddRule}
                    className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Another Grammar Rule</span>
                </button>
            </div>
        </div>
    );
};

export default GrammarRulesTopManager;
