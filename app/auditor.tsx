"use client";

import { useState } from "react";
import SearchBar from "./searchbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

interface SEOCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

interface PageAudit {
  url: string;
  score: number;
  checks: SEOCheck[];
}

function auditPage(url: string, html: string): PageAudit {
  const checks: SEOCheck[] = [];
  let score = 100;

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titleMatch) {
    checks.push({ name: "Title", status: "fail", message: "Missing title tag" });
    score -= 20;
  } else {
    const len = titleMatch[1].trim().length;
    if (len < 30 || len > 70) {
      checks.push({ name: "Title", status: "warn", message: `Title length: ${len} chars (ideal: 50-60)` });
      score -= 5;
    } else {
      checks.push({ name: "Title", status: "pass", message: `Title: "${titleMatch[1].trim().slice(0, 50)}..." (${len} chars)` });
    }
  }

  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (!descMatch) {
    checks.push({ name: "Meta Description", status: "fail", message: "Missing meta description" });
    score -= 15;
  } else {
    const len = descMatch[1].length;
    if (len < 120 || len > 170) {
      checks.push({ name: "Meta Description", status: "warn", message: `Description length: ${len} chars (ideal: 150-160)` });
      score -= 5;
    } else {
      checks.push({ name: "Meta Description", status: "pass", message: `Description: ${len} chars` });
    }
  }

  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count === 0) {
    checks.push({ name: "H1", status: "fail", message: "No H1 tag found" });
    score -= 15;
  } else if (h1Count > 1) {
    checks.push({ name: "H1", status: "warn", message: `${h1Count} H1 tags found (should be 1)` });
    score -= 5;
  } else {
    checks.push({ name: "H1", status: "pass", message: "Single H1 tag found" });
  }

  const imgCount = (html.match(/<img[\s]/gi) || []).length;
  const noAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
  if (noAlt > 0) {
    checks.push({ name: "Image Alt", status: "warn", message: `${noAlt}/${imgCount} images missing alt text` });
    score -= Math.min(10, noAlt * 2);
  } else if (imgCount > 0) {
    checks.push({ name: "Image Alt", status: "pass", message: `All ${imgCount} images have alt text` });
  }

  const hasOgTitle = /<meta[^>]*property=["']og:title["']/i.test(html);
  const hasOgDesc = /<meta[^>]*property=["']og:description["']/i.test(html);
  if (!hasOgTitle || !hasOgDesc) {
    checks.push({ name: "Open Graph", status: "warn", message: `Missing ${!hasOgTitle ? "og:title" : ""} ${!hasOgDesc ? "og:description" : ""}`.trim() });
    score -= 5;
  } else {
    checks.push({ name: "Open Graph", status: "pass", message: "OG title and description present" });
  }

  return { url, score: Math.max(0, score), checks };
}

type StatusFilter = "all" | "fail" | "warn" | "pass";
type SortKey = "score" | "url" | "issues";
type SortDir = "asc" | "desc";
type ExportFormat = "json" | "csv" | "markdown";

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function scoreBorder(score: number): string {
  if (score >= 80) return "border-green-500";
  if (score >= 50) return "border-yellow-500";
  return "border-red-500";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-green-500/10 border-green-500/20";
  if (score >= 50) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAudits(audits: PageAudit[], format: ExportFormat) {
  const ts = new Date().toISOString().slice(0, 10);
  const avg = audits.length ? Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length) : 0;

  if (format === "json") {
    downloadBlob(JSON.stringify({ date: ts, averageScore: avg, pages: audits }, null, 2), `seo-audit-${ts}.json`, "application/json");
  } else if (format === "csv") {
    const rows = [["URL", "Score", "Check", "Status", "Message"]];
    for (const a of audits) {
      if (a.checks.length === 0) {
        rows.push([a.url, String(a.score), "", "", "No checks"]);
      } else {
        for (const c of a.checks) {
          rows.push([a.url, String(a.score), c.name, c.status, c.message]);
        }
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(csv, `seo-audit-${ts}.csv`, "text/csv");
  } else {
    let md = `# SEO Audit Report\n\n**Date:** ${ts}\n**Pages Audited:** ${audits.length}\n**Average Score:** ${avg}/100\n\n---\n\n`;
    for (const a of audits) {
      md += `## ${a.url}\n\n**Score:** ${a.score}/100\n\n`;
      if (a.checks.length === 0) {
        md += "No checks performed.\n\n";
      } else {
        md += "| Status | Check | Message |\n|--------|-------|---------|\n";
        for (const c of a.checks) {
          md += `| ${c.status.toUpperCase()} | ${c.name} | ${c.message} |\n`;
        }
        md += "\n";
      }
    }
    downloadBlob(md, `seo-audit-${ts}.md`, "text/markdown");
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`inline-block ml-1 text-[10px] ${active ? "text-[#3bde77]" : "text-muted-foreground/40"}`}>
      {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}

export default function Auditor() {
  const [data, setData] = useState<any[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      toast({ title: "Copied", description: url });
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "url" ? "asc" : "asc");
    }
  };

  const audits: PageAudit[] = (data || [])
    .filter((p) => p?.url && p?.content)
    .map((p) => auditPage(p.url, p.content));

  const avgScore = audits.length ? Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length) : 0;
  const failCount = audits.filter((a) => a.checks.some((c) => c.status === "fail")).length;
  const warnCount = audits.filter((a) => a.checks.some((c) => c.status === "warn") && !a.checks.some((c) => c.status === "fail")).length;
  const passCount = audits.filter((a) => a.checks.every((c) => c.status === "pass")).length;
  const totalFails = audits.reduce((s, a) => s + a.checks.filter((c) => c.status === "fail").length, 0);
  const totalWarns = audits.reduce((s, a) => s + a.checks.filter((c) => c.status === "warn").length, 0);

  // Filter
  const filteredAudits = filter === "all"
    ? audits
    : filter === "fail"
    ? audits.filter((a) => a.checks.some((c) => c.status === "fail"))
    : filter === "warn"
    ? audits.filter((a) => a.checks.some((c) => c.status === "warn"))
    : audits.filter((a) => a.checks.every((c) => c.status === "pass"));

  // Sort
  const sortedAudits = [...filteredAudits].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "score") cmp = a.score - b.score;
    else if (sortKey === "url") cmp = a.url.localeCompare(b.url);
    else cmp = a.checks.filter((c) => c.status === "fail").length - b.checks.filter((c) => c.status === "fail").length;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const filterCounts: Record<StatusFilter, number> = {
    all: audits.length,
    fail: failCount,
    warn: warnCount,
    pass: passCount,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SearchBar setDataValues={setData} />
      <div className="flex-1 overflow-auto p-4 max-w-5xl mx-auto w-full">
        {audits.length > 0 ? (
          <>
            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              <div className={`border rounded-lg p-4 text-center ${scoreBg(avgScore)}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-4 mx-auto ${scoreBorder(avgScore)} ${scoreColor(avgScore)}`}>
                  {avgScore}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Avg Score</p>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{audits.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Pages Audited</p>
              </div>
              <div className="border rounded-lg p-4 text-center bg-red-500/10 border-red-500/20">
                <p className="text-2xl font-bold text-red-400">{totalFails}</p>
                <p className="text-xs text-muted-foreground mt-1">Fails</p>
              </div>
              <div className="border rounded-lg p-4 text-center bg-yellow-500/10 border-yellow-500/20">
                <p className="text-2xl font-bold text-yellow-400">{totalWarns}</p>
                <p className="text-xs text-muted-foreground mt-1">Warnings</p>
              </div>
              <div className="border rounded-lg p-4 text-center bg-green-500/10 border-green-500/20">
                <p className="text-2xl font-bold text-green-400">{passCount}</p>
                <p className="text-xs text-muted-foreground mt-1">All Pass</p>
              </div>
            </div>

            {/* Result Banner */}
            {totalFails === 0 && totalWarns === 0 ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 mb-6 text-center">
                <p className="text-green-400 font-semibold text-lg">All pages pass SEO checks!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No issues found across {audits.length} pages. Your SEO looks great.
                </p>
              </div>
            ) : totalFails > 0 ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-6 text-center">
                <p className="text-red-400 font-semibold text-lg">
                  {totalFails} fail{totalFails !== 1 ? "s" : ""} and {totalWarns} warning{totalWarns !== 1 ? "s" : ""} found
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Expand each page below to see issues and recommendations.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 mb-6 text-center">
                <p className="text-yellow-400 font-semibold text-lg">
                  {totalWarns} warning{totalWarns !== 1 ? "s" : ""} found
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  No critical fails, but some improvements are recommended.
                </p>
              </div>
            )}

            {/* Download Controls */}
            <div className="flex items-center gap-2 mb-4">
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="markdown">Markdown</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => exportAudits(audits, exportFormat)}>
                Download All ({audits.length})
              </Button>
              {filter !== "all" && sortedAudits.length > 0 && (
                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => exportAudits(sortedAudits, exportFormat)}>
                  Download Filtered ({sortedAudits.length})
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {([
                ["all", "All"],
                ["fail", "Fails"],
                ["warn", "Warnings"],
                ["pass", "Passing"],
              ] as [StatusFilter, string][]).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => setFilter(key)}
                  className="text-xs"
                >
                  {label} ({filterCounts[key]})
                </Button>
              ))}
            </div>

            {/* Page List */}
            {sortedAudits.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                No pages match the current filter.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                {/* Table Header */}
                <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                  <button className="w-12 text-center hover:text-foreground transition-colors" onClick={() => toggleSort("score")}>
                    Score<SortIcon active={sortKey === "score"} dir={sortDir} />
                  </button>
                  <button className="flex-1 text-left hover:text-foreground transition-colors" onClick={() => toggleSort("url")}>
                    Page URL<SortIcon active={sortKey === "url"} dir={sortDir} />
                  </button>
                  <button className="w-32 text-center hidden sm:block hover:text-foreground transition-colors" onClick={() => toggleSort("issues")}>
                    Issues<SortIcon active={sortKey === "issues"} dir={sortDir} />
                  </button>
                  <span className="w-6"></span>
                </div>
                {sortedAudits.map((audit) => {
                  const isExpanded = expanded === audit.url;
                  const pageFails = audit.checks.filter((c) => c.status === "fail").length;
                  const pageWarns = audit.checks.filter((c) => c.status === "warn").length;
                  return (
                    <div key={audit.url} className="border-b last:border-b-0">
                      <div
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : audit.url)}
                      >
                        <span className={`text-sm font-bold w-12 text-center ${scoreColor(audit.score)}`}>{audit.score}</span>
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <a
                            href={audit.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-mono text-xs hover:text-primary hover:underline"
                            title={audit.url}
                          >
                            {audit.url}
                          </a>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyUrl(audit.url); }}
                            className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy URL"
                          >
                            {copiedUrl === audit.url ? (
                              <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                            )}
                          </button>
                        </div>
                        <div className="w-32 hidden sm:flex gap-1.5 justify-center shrink-0">
                          {pageFails > 0 && (
                            <Badge variant="destructive" className="text-[10px]">
                              {pageFails} {pageFails === 1 ? "fail" : "fails"}
                            </Badge>
                          )}
                          {pageWarns > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                              {pageWarns} {pageWarns === 1 ? "warn" : "warns"}
                            </Badge>
                          )}
                          {pageFails === 0 && pageWarns === 0 && (
                            <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/30">
                              Pass
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs w-6 text-center shrink-0">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 space-y-2 bg-muted/10">
                          {audit.checks.map((check, i) => (
                            <div key={i} className="border rounded-lg p-3 text-sm bg-background">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge
                                  variant={check.status === "fail" ? "destructive" : check.status === "warn" ? "secondary" : "default"}
                                  className="text-[10px]"
                                >
                                  {check.status.toUpperCase()}
                                </Badge>
                                <span className="font-medium">{check.name}</span>
                              </div>
                              <p className="text-muted-foreground text-xs">{check.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <svg
              height={64}
              width={64}
              viewBox="0 0 24 24"
              xmlSpace="preserve"
              xmlns="http://www.w3.org/2000/svg"
              className="fill-[#3bde77] opacity-30"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M20.646 5.196A2.25 2.25 0 0 0 17.199 2.304L15.447 4.391A4.5 4.5 0 0 1 8.553 4.391L6.801 2.304A2.25 2.25 0 0 0 3.354 5.196L8.697 11.564A4.5 4.5 0 0 1 9.75 14.457L9.75 20.25A2.25 2.25 0 0 0 14.25 20.25L14.25 14.457A4.5 4.5 0 0 1 15.303 11.564L20.646 5.196Z"
              ></path>
            </svg>
            <h2 className="text-xl font-semibold text-muted-foreground">
              Spider SEO Auditor
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Enter a website URL above to crawl and audit for SEO issues.
              Spider will check for title tags, meta descriptions, heading structure,
              image alt text, and Open Graph tags.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
