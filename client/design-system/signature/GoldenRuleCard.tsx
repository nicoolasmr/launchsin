import React from 'react';
import { Card, CardContent } from '@/design-system/atoms/Card';
import { Badge } from '@/design-system/atoms/Badge';
import { Calendar, Search, Sparkles, ArrowRight } from 'lucide-react';

interface GoldenRuleCardProps {
    rule: string;
    source: string;
    period: string;
    confidence: number;
    evidence: string;
    nextAction: string;
}

export const GoldenRuleCard = ({
    rule,
    source,
    period,
    confidence,
    evidence,
    nextAction
}: GoldenRuleCardProps) => {
    return (
        <Card className="overflow-hidden border-l-4 border-l-brand-600 bg-white dark:bg-surface-900 shadow-glass">
            <div className="bg-brand-50 px-6 py-2 dark:bg-brand-950/20 flex items-center justify-between border-b border-brand-100 dark:border-brand-900/30">
                <div className="flex items-center gap-2 text-brand-700 dark:text-brand-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Golden Rule Engine</span>
                </div>
                <Badge variant="brand" className="text-[9px] px-1.5">{confidence}% Match</Badge>
            </div>
            <CardContent className="p-6">
                <h3 className="text-xl font-bold leading-tight text-surface-900 dark:text-white mb-6 italic">
                    "{rule}"
                </h3>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-surface-400 uppercase font-bold tracking-tighter">
                            <Search className="h-3 w-3" />
                            Source
                        </div>
                        <p className="text-sm font-medium">{source}</p>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-surface-400 uppercase font-bold tracking-tighter">
                            <Calendar className="h-3 w-3" />
                            Period
                        </div>
                        <p className="text-sm font-medium">{period}</p>
                    </div>
                </div>

                <div className="p-3 rounded-md bg-surface-50 dark:bg-surface-950/40 border border-surface-100 dark:border-surface-800 mb-6">
                    <div className="text-[10px] text-brand-600 dark:text-brand-400 uppercase font-bold mb-1 tracking-tighter">Evidence</div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed italic">
                        {evidence}
                    </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-surface-100 dark:border-surface-800">
                    <div>
                        <div className="text-[10px] text-surface-400 uppercase font-bold tracking-tighter mb-0.5">Next Action</div>
                        <div className="text-sm font-semibold text-brand-600 dark:text-brand-400">{nextAction}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-surface-300" />
                </div>
            </CardContent>
        </Card>
    );
};
