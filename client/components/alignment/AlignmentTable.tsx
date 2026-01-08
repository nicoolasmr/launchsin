
import React from 'react';

// Simplified type for UI
export interface AlignmentReportUI {
    id: string;
    ad_id: string;
    ad_name?: string; // If available or derived
    evidence: {
        ad_headline?: string;
    };
    landing_url: string;
    score: number;
    dimensions: {
        tracking_health: number;
    };
    created_at: string;
}

interface AlignmentTableProps {
    reports: AlignmentReportUI[];
    onViewEvidence: (report: AlignmentReportUI) => void;
    isLoading?: boolean;
}

export const AlignmentTable: React.FC<AlignmentTableProps> = ({ reports, onViewEvidence, isLoading }) => {
    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">Loading reports...</div>;
    }

    if (reports.length === 0) {
        return (
            <div className="rounded-md border border-dashed p-8 text-center animate-in fade-in-50">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                    <svg className="h-6 w-6 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold">No alignment checks found</h3>
                <p className="mb-4 mt-2 text-sm text-muted-foreground">
                    Connect your Ad Account and Landing Pages to start verifying alignment.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-md border">
            <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Ad Creative</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Landing Page</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Score</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Tracking</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                            <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {reports.map((report) => (
                            <tr key={report.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <td className="p-4 align-middle">
                                    <div className="flex flex-col">
                                        <span className="font-medium truncate max-w-[200px]">{report.evidence.ad_headline || report.ad_id}</span>
                                        <span className="text-xs text-muted-foreground">ID: {report.ad_id}</span>
                                    </div>
                                </td>
                                <td className="p-4 align-middle">
                                    <a href={report.landing_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline truncate max-w-[200px] block">
                                        {report.landing_url}
                                    </a>
                                </td>
                                <td className="p-4 align-middle">
                                    <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${report.score >= 90 ? 'border-transparent bg-green-500 text-white shadow hover:bg-green-500/80' :
                                            report.score >= 70 ? 'border-transparent bg-green-100 text-green-700 hover:bg-green-100/80' :
                                                report.score >= 50 ? 'border-transparent bg-yellow-100 text-yellow-700 hover:bg-yellow-100/80' :
                                                    'border-transparent bg-red-100 text-red-700 hover:bg-red-100/80'
                                        }`}>
                                        {report.score}
                                    </div>
                                </td>
                                <td className="p-4 align-middle">
                                    {report.dimensions.tracking_health === 100 ? (
                                        <div className="flex items-center text-green-600 gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                            <span className="text-xs">OK</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center text-red-600 gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                                            <span className="text-xs">Missing</span>
                                        </div>
                                    )}
                                </td>
                                <td className="p-4 align-middle text-muted-foreground text-xs">
                                    {new Date(report.created_at).toLocaleDateString()}
                                </td>
                                <td className="p-4 align-middle text-right">
                                    <button
                                        onClick={() => onViewEvidence(report)}
                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                                    >
                                        View Evidence
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
