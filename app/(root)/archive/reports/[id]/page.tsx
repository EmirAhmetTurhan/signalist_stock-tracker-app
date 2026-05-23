import { getReportById } from "@/lib/actions/report.actions";
import MarkdownRenderer from "@/components/ai/MarkdownRenderer";
import Link from "next/link";
import { ArrowLeft, BarChart2 } from "lucide-react";
import { notFound } from "next/navigation";

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
    const { id } = await params;
    const res = await getReportById(id);
    
    if (!res.success || !res.report) {
        return notFound();
    }

    const report = res.report;

    return (
        <div className="max-w-4xl mx-auto py-8 px-6">
            <Link href="/archive" className="flex items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors mb-6 w-fit">
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Archive</span>
            </Link>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold text-white">{report.symbol} Analysis Report</h1>
                            <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-400 text-xs font-medium border border-blue-500/30">
                                {report.indicator}
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm">
                            Generated on {new Date(report.createdAt).toLocaleString()}
                        </p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                        <BarChart2 className="w-8 h-8 text-blue-400" />
                    </div>
                </div>

                <div className="prose prose-invert max-w-none">
                    <MarkdownRenderer content={report.result || report.errorMessage || "No content generated."} />
                </div>
            </div>
        </div>
    );
}
