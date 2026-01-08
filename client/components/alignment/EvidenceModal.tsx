
import React from 'react';

// Extended details for Modal
export interface AlignmentReportDetails {
    id: string;
    ad_id: string;
    evidence: {
        ad_headline?: string;
        ad_body?: string;
        page_h1?: string[];
        pixels_detected?: string[];
        utms_detected?: string[];
    };
    landing_url: string;
    score: number;
    recommendations: string[];
    screenshot_url?: string | null;
    summary: string;
}

interface EvidenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: AlignmentReportDetails | null;
    isLoading: boolean;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({ isOpen, onClose, report, isLoading }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in-0">
            <div className="relative bg-background w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-lg border shadow-lg flex flex-col">
                {/* Header */}
                <div className="flex flex-row items-center justify-between border-b p-6">
                    <div>
                        <h2 className="text-lg font-semibold">Evidence Viewer (Glass Box)</h2>
                        <p className="text-sm text-muted-foreground">Verification details for ID: {report?.ad_id}</p>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-0">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center p-12">Loading evidence details...</div>
                    ) : report ? (
                        <div className="flex flex-col lg:flex-row h-full">
                            {/* Left: Ad Creative */}
                            <div className="w-full lg:w-1/3 border-r bg-muted/10 p-6 overflow-y-auto">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <span>Ad Creative</span>
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Source: Meta</span>
                                </h3>

                                <div className="space-y-4">
                                    <div className="bg-card border rounded-md p-4 shadow-sm">
                                        <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Headline</p>
                                        <p className="font-medium text-lg leading-tight">{report.evidence?.ad_headline || 'N/A'}</p>
                                    </div>
                                    <div className="bg-card border rounded-md p-4 shadow-sm">
                                        <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Primary Text</p>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.evidence?.ad_body || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Middle: Analysis & Recommendations */}
                            <div className="w-full lg:w-1/3 border-r p-6 overflow-y-auto bg-background">
                                <div className="mb-6 text-center">
                                    <div className={`inline-flex items-center justify-center h-20 w-20 rounded-full border-4 text-3xl font-bold ${report.score >= 90 ? 'border-green-500 text-green-600' :
                                            report.score >= 70 ? 'border-green-200 text-green-600' :
                                                report.score >= 50 ? 'border-yellow-200 text-yellow-600' : 'border-red-200 text-red-600'
                                        }`}>
                                        {report.score}
                                    </div>
                                    <p className="mt-2 font-medium">Alignment Score</p>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <h4 className="font-semibold text-sm mb-2">Analysis Summary</h4>
                                        <p className="text-sm text-muted-foreground">{report.summary}</p>
                                    </div>

                                    <div>
                                        <h4 className="font-semibold text-sm mb-2">Golden Rule Recommendations</h4>
                                        <ul className="space-y-2">
                                            {report.recommendations.map((rec, i) => (
                                                <li key={i} className="flex gap-2 text-sm">
                                                    <span className="text-blue-500 font-bold">•</span>
                                                    <span>{rec}</span>
                                                </li>
                                            ))}
                                            {report.recommendations.length === 0 && <li className="text-sm text-muted-foreground italic">No recommendations. Perfect match!</li>}
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="font-semibold text-sm mb-2">Technical Signals</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {report.evidence?.pixels_detected?.map(p => (
                                                <span key={p} className="text-xs border px-2 py-1 rounded-md bg-green-50 text-green-700 border-green-200">Pixel: {p}</span>
                                            ))}
                                            {report.evidence?.utms_detected?.length ? (
                                                <span className="text-xs border px-2 py-1 rounded-md bg-green-50 text-green-700 border-green-200">UTMs Present</span>
                                            ) : (
                                                <span className="text-xs border px-2 py-1 rounded-md bg-red-50 text-red-700 border-red-200">UTMs Missing</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Landing Page Evidence */}
                            <div className="w-full lg:w-1/3 p-6 overflow-y-auto bg-muted/10">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <span>Landing Page</span>
                                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Source: Playwright</span>
                                </h3>

                                <div className="space-y-4">
                                    <div className="bg-card border rounded-md overflow-hidden shadow-sm aspect-video relative group">
                                        {report.screenshot_url ? (
                                            <a href={report.screenshot_url} target="_blank" rel="noreferrer">
                                                <img src={report.screenshot_url} alt="Landing Page Screenshot" className="object-cover w-full h-full transition-transform hover:scale-105" />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                    <span className="text-white text-xs bg-black/50 px-2 py-1 rounded">Open Full Info</span>
                                                </div>
                                            </a>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-muted-foreground text-xs bg-muted">No Screenshot Available</div>
                                        )}
                                    </div>

                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Extracted H1</p>
                                        <div className="text-sm bg-background border rounded p-2">
                                            {report.evidence?.page_h1?.map((h, i) => (
                                                <div key={i} className="mb-1 last:mb-0 border-b last:border-0 pb-1 last:pb-0 border-dashed">{h}</div>
                                            )) || 'N/A'}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase font-bold mb-1">URL</p>
                                        <p className="text-xs font-mono break-all text-muted-foreground">{report.landing_url}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-12 text-center">No report selected.</div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t p-4 flex justify-end gap-2 bg-muted/50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-accent bg-background">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
