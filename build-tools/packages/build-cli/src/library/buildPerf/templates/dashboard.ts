/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Browser-side dashboard script. Compiled by the main tsc build and inlined
 * into a {@literal <script>} tag via the EJS template (dashboard.ejs).
 * The htmlGenerator strips tsc's module wrapper (`export {}`) since this
 * runs as a plain script in the browser, not an ES module.
 *
 * Globals `dashboardData`, `chartInstances`, `tableState`, and `itemsPerPage`
 * are declared in the EJS template's script block before this code is injected.
 */

// Types imported at compile time — `import type` is fully erased by tsc,
// so the compiled JS has no import statement and can be inlined as a plain <script>.
import type {
	BuildSummary,
	DurationTrendPoint,
	ProcessedBuild,
	StagePerformance,
} from "../types.js";

interface DashboardTrendEntry {
	date: string;
	buildCount: number;
	buildIds: number[];
	[key: string]: unknown;
}

interface DashboardData {
	generatedAt: string;
	summary: BuildSummary;
	durationTrend: DurationTrendPoint[];
	change3Day: number;
	change7Day: number;
	recentBuilds: ProcessedBuild[];
	longestBuilds: ProcessedBuild[];
	stagePerformance: StagePerformance[];
	stageTaskBreakdown: Record<string, StagePerformance[]>;
	stageDurationTrend: { trendData: DashboardTrendEntry[]; stageNames: string[] };
	taskDurationTrend: { trendData: DashboardTrendEntry[]; taskNames: string[] };
}

interface ColorScheme {
	primary: string;
	background: string;
	tasks: string[];
}

// Minimal Chart.js callback types (Chart.js is loaded from CDN without type declarations)
interface ChartPointContext {
	raw?: { isOutlier?: boolean };
}
interface ChartTooltipItem {
	raw: { x?: Date; isOutlier?: boolean; buildId?: number };
	dataset: { label?: string };
	parsed: { y: number };
	dataIndex: number;
	datasetIndex: number;
}
interface ChartDataset {
	label?: string;
	data: { buildId?: number }[];
	borderColor?: string;
	borderWidth?: number;
	borderDash?: number[];
}
interface ChartInstance {
	data: { datasets: ChartDataset[] };
	isDatasetVisible(index: number): boolean;
	setDatasetVisibility(index: number, visible: boolean): void;
	update(): void;
}
interface ChartClickElement {
	datasetIndex: number;
	index: number;
}
interface ChartLegend {
	chart: ChartInstance;
}
interface ChartLegendItem {
	datasetIndex: number;
}

// Ambient declarations for globals injected by the EJS template or loaded from CDN
declare const dashboardData: Record<string, DashboardData | null>;
declare const chartInstances: Record<string, Record<string, { destroy(): void }>>;
declare const tableState: Record<
	string,
	Record<string, { sort: { column: string; direction: string }; page: number }>
>;
declare const itemsPerPage: number;
// Conditionally injected by EJS in standalone mode
declare const STANDALONE_MODE: string | undefined;
declare const INLINED_DATA: DashboardData | undefined;
// Chart.js loaded from CDN in the HTML <head>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Chart: any;

// ============================================
// Constants
// ============================================
const colors: Record<string, ColorScheme> = {
	public: {
		primary: "rgba(66, 165, 245, 1)",
		background: "rgba(66, 165, 245, 0.1)",
		tasks: [
			"rgba(76, 175, 80, 0.8)",
			"rgba(66, 165, 245, 0.8)",
			"rgba(255, 167, 38, 0.8)",
			"rgba(171, 71, 188, 0.8)",
			"rgba(38, 166, 154, 0.8)",
			"rgba(236, 64, 122, 0.8)",
		],
	},
	internal: {
		primary: "rgba(21, 101, 192, 1)",
		background: "rgba(21, 101, 192, 0.1)",
		tasks: [
			"rgba(27, 94, 32, 0.8)",
			"rgba(21, 101, 192, 0.8)",
			"rgba(230, 81, 0, 0.8)",
			"rgba(106, 27, 154, 0.8)",
			"rgba(0, 105, 92, 0.8)",
			"rgba(183, 28, 28, 0.8)",
		],
	},
};
const config = {
	githubRepo: "microsoft/FluidFramework",
	org: "fluidframework",
};
// ============================================
// UI Functions
// ============================================
function switchTab(mode: string): void {
	document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
	document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
	document.querySelector(".tab." + mode)?.classList.add("active");
	document.getElementById(mode + "-content")?.classList.add("active");
	const data = dashboardData[mode];
	if (data) setTimeout(() => renderDashboard(mode, data), 50);
}
async function loadData(): Promise<void> {
	// Check for standalone mode (variables injected by EJS template)
	if (typeof STANDALONE_MODE !== "undefined" && typeof INLINED_DATA !== "undefined") {
		const mode = STANDALONE_MODE;
		const modeLabel = mode === "public" ? "PR Builds" : "Internal Builds";
		// Adapt UI for single-mode standalone
		document.querySelector(".tabs")?.remove();
		document.title = "FF Build Dashboard - " + modeLabel;
		const heading = document.querySelector(".header-row h1");
		if (heading)
			heading.textContent = "Fluid Framework Build Performance Dashboard - " + modeLabel;
		const otherMode = mode === "public" ? "internal" : "public";
		document.getElementById(otherMode + "-content")?.remove();
		document.getElementById(mode + "-content")?.classList.add("active");
		// Load inlined data
		if (INLINED_DATA) {
			dashboardData[mode] = INLINED_DATA;
			setDisplay(mode + "-loading", "none");
			setDisplay(mode + "-dashboard", "block");
			renderDashboard(mode, INLINED_DATA);
		} else {
			setDisplay(mode + "-loading", "none");
			setDisplay(mode + "-no-data", "block");
		}
		return;
	}
	// Multi-mode: fetch data from JSON files
	const [prResult, internalResult] = await Promise.allSettled([
		fetch("data/public-data.json").then((r) => {
			if (!r.ok) return null;
			return r.json().catch((e: unknown) => {
				console.error("Failed to parse public data JSON:", e);
				return null;
			});
		}),
		fetch("data/internal-data.json").then((r) => {
			if (!r.ok) return null;
			return r.json().catch((e: unknown) => {
				console.error("Failed to parse internal data JSON:", e);
				return null;
			});
		}),
	]);
	if (prResult.status === "fulfilled" && prResult.value) {
		dashboardData.public = prResult.value;
		setDisplay("public-loading", "none");
		setDisplay("public-dashboard", "block");
		renderDashboard("public", prResult.value);
	} else {
		setDisplay("public-loading", "none");
		setDisplay("public-no-data", "block");
	}
	if (internalResult.status === "fulfilled" && internalResult.value) {
		dashboardData.internal = internalResult.value;
		setDisplay("internal-loading", "none");
		setDisplay("internal-dashboard", "block");
		renderDashboard("internal", internalResult.value);
	} else {
		setDisplay("internal-loading", "none");
		setDisplay("internal-no-data", "block");
	}
}
function renderDashboard(mode: string, data: DashboardData): void {
	const container = document.getElementById(mode + "-dashboard");
	if (!container) return;
	const colorScheme = colors[mode];
	const modeLabel = mode === "public" ? "PR" : "internal";
	const trendDays = mode === "public" ? 3 : 7;
	let durationChange = 0;
	let durationChangeMinutes = 0;
	if (data.durationTrend && data.durationTrend.length > 0) {
		const latestDate = data.durationTrend.reduce(
			(max, d) => (d.date > max ? d.date : max),
			data.durationTrend[0].date,
		);
		const trendDate = new Date(latestDate);
		trendDate.setDate(trendDate.getDate() - trendDays);
		const trendDateStr = trendDate.toISOString().split("T")[0];
		const recentBuilds = data.durationTrend.filter((d) => d.date >= trendDateStr);
		const previousBuilds = data.durationTrend.filter((d) => d.date < trendDateStr);
		if (recentBuilds.length > 0 && previousBuilds.length > 0) {
			const recentAvg =
				recentBuilds.reduce((sum, d) => sum + d.avgDuration, 0) / recentBuilds.length;
			const previousAvg =
				previousBuilds.reduce((sum, d) => sum + d.avgDuration, 0) / previousBuilds.length;
			durationChange = ((recentAvg - previousAvg) / previousAvg) * 100;
			durationChangeMinutes = recentAvg - previousAvg;
		}
	}
	const trendColor =
		durationChange < 0 ? "#107c10" : durationChange > 0 ? "#d13438" : "#605e5c";
	const trendSign = durationChange > 0 ? "+" : durationChange < 0 ? "" : "";
	const timestamp = data.generatedAt
		? (() => {
				const d = new Date(data.generatedAt);
				return (
					d.toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
					}) +
					" " +
					d.toLocaleTimeString("en-US", {
						hour: "numeric",
						minute: "2-digit",
						timeZoneName: "short",
					})
				);
			})()
		: "Unknown";
	const pipelineUrl =
		mode === "public"
			? "https://dev.azure.com/fluidframework/public/_build?definitionId=190"
			: "https://dev.azure.com/fluidframework/internal/_build?definitionId=191";
	const buildPipelineUrl =
		mode === "public"
			? "https://dev.azure.com/fluidframework/public/_build?definitionId=11"
			: "https://dev.azure.com/fluidframework/internal/_build?definitionId=12";
	container.innerHTML =
		'<div class="info"><h3>About This Dashboard</h3><p style="margin-bottom: 4px;">Last updated: <strong>' +
		escapeHtml(timestamp) +
		'</strong></p><p style="font-size: 13px; margin-top: 0; margin-bottom: 16px;">Run the <a href="' +
		pipelineUrl +
		'" target="_blank">Build Performance Observability Pipeline (' +
		mode +
		")</a> to manually update the dashboard.</p><p>This dashboard shows metrics for <strong>" +
		modeLabel +
		" builds</strong>.</p><ul>" +
		(mode === "public"
			? "<li>Target branch: <code>main</code></li>"
			: "<li>Branch: <code>main</code></li>") +
		'<li>Status: <code>completed</code> and <code>succeeded</code> or <code>partiallySucceeded</code></li><li>Pipeline: <a href="' +
		buildPipelineUrl +
		'" target="_blank">Build - client packages (' +
		mode +
		')</a></li><li>Data source: <a href="https://learn.microsoft.com/en-us/rest/api/azure/devops/build/?view=azure-devops-rest-7.1" target="_blank">Azure DevOps Build API (v7.1)</a></li></ul></div>' +
		'<div class="metrics"><div class="metric-card"><div class="metric-label">Total Builds</div><div class="metric-value">' +
		escapeHtml(String(data.summary?.totalBuilds || 0)) +
		"</div></div>" +
		'<div class="metric-card"><div class="metric-label">Avg Duration</div><div class="metric-value">' +
		escapeHtml((data.summary?.avgDuration || 0).toFixed(1)) +
		"m</div></div>" +
		'<div class="metric-card"><div class="metric-label">' +
		trendDays +
		'-Day Trend <span class="info-icon">ⓘ<span class="tooltip">Compares average duration of last ' +
		trendDays +
		" days vs the average of all builds before that</span></span></div>" +
		'<div class="metric-value" style="color: ' +
		trendColor +
		'">' +
		trendSign +
		Math.abs(durationChangeMinutes).toFixed(1) +
		'm <span style="font-size: 18px; opacity: 0.8;">(' +
		trendSign +
		Math.abs(durationChange).toFixed(1) +
		"%)</span></div></div></div>" +
		'<h2>Duration Trend</h2><div class="chart-container duration-chart"><canvas id="' +
		mode +
		'-duration-chart"></canvas><span class="chart-legend-info info-icon">ⓘ<span class="tooltip">Outliers of ±20% from daily average are highlighted with clickable markers</span></span></div>' +
		'<div class="chart-header"><h2>Stage Breakdown</h2><select id="' +
		mode +
		'-stage-view-select" onchange="switchStageView(\'' +
		mode +
		'\')"><option value="by-stage">By Stage</option><option value="over-time">By Day</option></select></div>' +
		'<div class="chart-container stage-chart" id="' +
		mode +
		'-stage-container"><div class="chart-title-overlay" id="' +
		mode +
		'-stage-title-overlay" style="display: none;">Stage Duration by Day <span class="info-icon">ⓘ<span class="tooltip">Click a legend item to isolate it. Click again to show all.</span></span></div><canvas id="' +
		mode +
		'-stage-chart"></canvas></div>' +
		'<div class="chart-header"><h2>Task Breakdown</h2><select id="' +
		mode +
		'-task-view-select" onchange="switchTaskView(\'' +
		mode +
		'\')"><option value="by-task">By Task</option><option value="over-time">By Day</option></select></div>' +
		'<div class="chart-container stage-chart" id="' +
		mode +
		'-task-container"><div class="chart-title-overlay" id="' +
		mode +
		'-task-title-overlay" style="display: none;">Average Task Duration by Day <span class="info-icon">ⓘ<span class="tooltip">Click a legend item to isolate it. Click again to show all.</span></span></div><canvas id="' +
		mode +
		'-task-chart"></canvas></div>' +
		'<h2>Recent Builds</h2><div class="table-container"><table class="builds-table" id="' +
		mode +
		'-recent-table"><thead><tr><th data-sort="id">Build ID <span class="sort-icon">↕</span></th><th data-sort="date" class="sort-desc">Date <span class="sort-icon">↓</span></th><th data-sort="duration">Duration <span class="sort-icon">↕</span></th><th data-sort="source">Source <span class="sort-icon">↕</span></th></tr></thead><tbody id="' +
		mode +
		'-recent-body"></tbody></table><div class="pagination"><div class="pagination-info">Showing <span id="' +
		mode +
		'-recent-start">1</span>-<span id="' +
		mode +
		'-recent-end">5</span> of <span id="' +
		mode +
		'-recent-total">' +
		(data.recentBuilds || []).length +
		'</span></div><div class="pagination-controls"><button class="pagination-btn" id="' +
		mode +
		'-recent-prev" onclick="prevPage(\'' +
		mode +
		'\', \'recent\')">← Previous</button><button class="pagination-btn" id="' +
		mode +
		'-recent-next" onclick="nextPage(\'' +
		mode +
		"', 'recent')\">Next →</button></div></div></div>" +
		'<h2>Longest Builds</h2><div class="table-container"><table class="builds-table" id="' +
		mode +
		'-longest-table"><thead><tr><th data-sort="id">Build ID <span class="sort-icon">↕</span></th><th data-sort="date">Date <span class="sort-icon">↕</span></th><th data-sort="duration" class="sort-desc">Duration <span class="sort-icon">↓</span></th><th data-sort="source">Source <span class="sort-icon">↕</span></th></tr></thead><tbody id="' +
		mode +
		'-longest-body"></tbody></table><div class="pagination"><div class="pagination-info">Showing <span id="' +
		mode +
		'-longest-start">1</span>-<span id="' +
		mode +
		'-longest-end">5</span> of <span id="' +
		mode +
		'-longest-total">' +
		(data.longestBuilds || []).length +
		'</span></div><div class="pagination-controls"><button class="pagination-btn" id="' +
		mode +
		'-longest-prev" onclick="prevPage(\'' +
		mode +
		'\', \'longest\')">← Previous</button><button class="pagination-btn" id="' +
		mode +
		'-longest-next" onclick="nextPage(\'' +
		mode +
		"', 'longest')\">Next →</button></div></div></div>";
	createDurationChart(mode, data, colorScheme);
	createStageChart(mode, data, colorScheme);
	createTaskChart(mode, data, colorScheme);
	renderTable(mode, "recent", data.recentBuilds || []);
	renderTable(mode, "longest", data.longestBuilds || []);
	setupTableSorting(mode, "recent", data.recentBuilds || []);
	setupTableSorting(mode, "longest", data.longestBuilds || []);
}
function createDurationChart(
	mode: string,
	data: DashboardData,
	colorScheme: ColorScheme,
): void {
	const ctx = document.getElementById(mode + "-duration-chart");
	if (!ctx) return;
	if (chartInstances[mode].duration) chartInstances[mode].duration.destroy();
	if (!data.durationTrend || data.durationTrend.length === 0) {
		if (ctx.parentElement)
			ctx.parentElement.innerHTML =
				'<p style="padding: 20px; text-align: center; color: #605e5c;">No duration data available</p>';
		return;
	}
	const minData = data.durationTrend.map((d) => ({
		x: new Date(d.date),
		y: d.minDuration,
		isOutlier: d.minDuration <= d.avgDuration * 0.8,
		buildId: d.minBuildId,
	}));
	const avgData = data.durationTrend.map((d) => ({
		x: new Date(d.date),
		y: d.avgDuration,
	}));
	const maxData = data.durationTrend.map((d) => ({
		x: new Date(d.date),
		y: d.maxDuration,
		isOutlier: d.maxDuration >= d.avgDuration * 1.2,
		buildId: d.maxBuildId,
	}));
	const project = mode === "public" ? "public" : "internal";
	chartInstances[mode].duration = new Chart(ctx, {
		type: "line",
		data: {
			datasets: [
				{
					label: "Max",
					data: maxData,
					borderColor: "rgba(211, 52, 56, 0.6)",
					backgroundColor: "rgba(211, 52, 56, 0.6)",
					borderWidth: 1.5,
					borderDash: [4, 4],
					fill: false,
					tension: 0.4,
					pointRadius: (ctx: ChartPointContext) => (ctx.raw && ctx.raw.isOutlier ? 4 : 0),
					pointHoverRadius: (ctx: ChartPointContext) => (ctx.raw && ctx.raw.isOutlier ? 5 : 0),
					pointStyle: "circle",
					clip: 8,
				},
				{
					label: "Avg",
					data: avgData,
					borderColor: colorScheme.primary,
					backgroundColor: colorScheme.background,
					borderWidth: 2,
					fill: true,
					tension: 0.4,
					pointRadius: 3,
					pointHoverRadius: 4,
					pointStyle: "circle",
				},
				{
					label: "Min",
					data: minData,
					borderColor: "rgba(16, 124, 16, 0.6)",
					backgroundColor: "rgba(16, 124, 16, 0.6)",
					borderWidth: 1.5,
					borderDash: [4, 4],
					fill: false,
					tension: 0.4,
					pointRadius: (ctx: ChartPointContext) => (ctx.raw && ctx.raw.isOutlier ? 4 : 0),
					pointHoverRadius: (ctx: ChartPointContext) => (ctx.raw && ctx.raw.isOutlier ? 5 : 0),
					pointStyle: "circle",
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					onClick: null,
					position: "top",
					labels: {
						boxWidth: 20,
						padding: 15,
						generateLabels(chart: ChartInstance) {
							return chart.data.datasets.map((dataset, i: number) => ({
								text: dataset.label,
								fillStyle: "transparent",
								strokeStyle: dataset.borderColor,
								lineWidth: dataset.borderWidth,
								lineDash: dataset.borderDash || [],
								hidden: !chart.isDatasetVisible(i),
								datasetIndex: i,
							}));
						},
					},
				},
				title: {
					display: true,
					text: "Build Duration Trend",
					font: { size: 14, weight: "bold" },
				},
				tooltip: {
					callbacks: {
						title(context: ChartTooltipItem[]) {
							const date = context[0].raw.x;
							if (!date) return "";
							return date.toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								year: "numeric",
							});
						},
						label(context: ChartTooltipItem) {
							const label = context.dataset.label || "";
							const value = context.parsed.y.toFixed(1) + "m";
							if (context.raw && context.raw.buildId && context.raw.isOutlier) {
								return label + ": " + value + " (Build #" + context.raw.buildId + ")";
							}
							return label + ": " + value;
						},
						afterLabel(context: ChartTooltipItem) {
							if (context.raw && context.raw.isOutlier && context.raw.buildId) {
								return "Click to view build";
							}
							return "";
						},
					},
					filter(tooltipItem: ChartTooltipItem) {
						if (tooltipItem.datasetIndex === 0 || tooltipItem.datasetIndex === 2) {
							return tooltipItem.raw && tooltipItem.raw.isOutlier;
						}
						return true;
					},
				},
			},
			scales: {
				x: { type: "time", time: { unit: "day" }, title: { display: true, text: "Date" } },
				y: {
					beginAtZero: true,
					title: { display: true, text: "Duration (minutes)" },
				},
			},
			onClick(this: ChartInstance, _event: unknown, elements: ChartClickElement[]) {
				if (elements.length > 0) {
					const el = elements[0];
					const dataPoint = this.data.datasets[el.datasetIndex].data[el.index];
					if (dataPoint && dataPoint.buildId) {
						window.open(
							"https://dev.azure.com/" +
								config.org +
								"/" +
								project +
								"/_build/results?buildId=" +
								dataPoint.buildId,
							"_blank",
						);
					}
				}
			},
		},
	});
}
function createBarTrendChart(
	mode: string,
	chartKey: string,
	canvasId: string,
	trendData: DashboardTrendEntry[],
	names: string[],
	colorScheme: ColorScheme,
): void {
	const ctx = document.getElementById(mode + "-" + canvasId);
	if (!ctx) return;
	if (chartInstances[mode][chartKey]) chartInstances[mode][chartKey].destroy();
	if (trendData.length === 0 || names.length === 0) {
		if (ctx.parentElement)
			ctx.parentElement.innerHTML =
				'<p style="padding: 20px; text-align: center; color: #605e5c;">No ' +
				escapeHtml(chartKey) +
				" trend data available</p>";
		return;
	}
	const project = mode === "public" ? "public" : "internal";
	const formatDate = (dateStr: string): string => {
		const [y, m, d] = dateStr.split("-");
		return m + "/" + d + "/" + y;
	};
	const labels = trendData.map((d) => formatDate(d.date));
	const datasets = names.map((name: string, index: number) => ({
		label: name,
		data: trendData.map((d) => d[name] || 0),
		backgroundColor: colorScheme.tasks[index % colorScheme.tasks.length],
		borderWidth: 0,
	}));
	chartInstances[mode][chartKey] = new Chart(ctx, {
		type: "bar",
		data: { labels, datasets },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "bottom",
					labels: { boxWidth: 12, padding: 8 },
					onClick(
						this: unknown,
						_e: unknown,
						legendItem: ChartLegendItem,
						legend: ChartLegend,
					) {
						const chart = legend.chart;
						const clickedIndex = legendItem.datasetIndex;
						const allHiddenExceptClicked = chart.data.datasets.every(
							(_ds: unknown, i: number) =>
								i === clickedIndex ? chart.isDatasetVisible(i) : !chart.isDatasetVisible(i),
						);
						if (allHiddenExceptClicked) {
							chart.data.datasets.forEach((_ds: unknown, i: number) => {
								chart.setDatasetVisibility(i, true);
							});
						} else {
							chart.data.datasets.forEach((_ds: unknown, i: number) => {
								chart.setDatasetVisibility(i, i === clickedIndex);
							});
						}
						chart.update();
					},
				},
				title: { display: false },
				tooltip: {
					callbacks: {
						title(context: ChartTooltipItem[]) {
							const idx = context[0].dataIndex;
							const dataPoint = trendData[idx];
							const buildCount = dataPoint ? dataPoint.buildCount : 0;
							const date = new Date(dataPoint.date);
							const formatted = date.toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								year: "numeric",
								timeZone: "UTC",
							});
							return (
								formatted + " (" + buildCount + " build" + (buildCount !== 1 ? "s" : "") + ")"
							);
						},
						label(context: ChartTooltipItem) {
							return context.dataset.label + ": " + context.parsed.y.toFixed(1) + "m";
						},
						afterBody(context: ChartTooltipItem[]) {
							const idx = context[0].dataIndex;
							const dataPoint = trendData[idx];
							if (dataPoint && dataPoint.buildIds && dataPoint.buildIds.length === 1) {
								return "Click to view build #" + dataPoint.buildIds[0];
							}
							return "";
						},
					},
				},
			},
			scales: {
				x: { stacked: true, title: { display: true, text: "Date" } },
				y: {
					stacked: true,
					beginAtZero: true,
					title: { display: true, text: "Duration (minutes)" },
				},
			},
			onClick(this: unknown, _event: unknown, elements: ChartClickElement[]) {
				if (elements.length > 0) {
					const el = elements[0];
					const dataPoint = trendData[el.index];
					if (dataPoint && dataPoint.buildIds && dataPoint.buildIds.length === 1) {
						window.open(
							"https://dev.azure.com/" +
								config.org +
								"/" +
								project +
								"/_build/results?buildId=" +
								dataPoint.buildIds[0],
							"_blank",
						);
					}
				}
			},
		},
	});
}
function createStageChart(mode: string, data: DashboardData, colorScheme: ColorScheme): void {
	const ctx = document.getElementById(mode + "-stage-chart");
	if (!ctx) return;
	if (chartInstances[mode].stage) chartInstances[mode].stage.destroy();
	const stageData = data.stageTaskBreakdown || {};
	const stagePerf = data.stagePerformance || [];
	const stages = Object.keys(stageData).sort();
	if (stages.length === 0) {
		if (ctx.parentElement)
			ctx.parentElement.innerHTML =
				'<p style="padding: 20px; text-align: center; color: #605e5c;">No stage data available</p>';
		return;
	}
	const stageAvgDurations: Record<string, number> = {};
	stagePerf.forEach((s) => {
		stageAvgDurations[s.name] = s.avgDuration;
	});
	const allTasks = new Set<string>();
	stages.forEach((stage) => {
		const tasks = stageData[stage] || [];
		if (tasks.length === 0) allTasks.add(stage);
		else tasks.forEach((task) => allTasks.add(task.name));
	});
	const taskNames = Array.from(allTasks).sort();
	const datasets = taskNames.map((taskName: string, index: number) => ({
		label: taskName,
		data: stages.map((stage) => {
			const tasks = stageData[stage] || [];
			if (tasks.length === 0 && taskName === stage) return stageAvgDurations[stage] || 0;
			const task = tasks.find((t) => t.name === taskName);
			return task ? task.avgDuration : 0;
		}),
		backgroundColor: colorScheme.tasks[index % colorScheme.tasks.length],
		borderWidth: 1,
	}));
	chartInstances[mode].stage = new Chart(ctx, {
		type: "bar",
		data: { labels: stages, datasets },
		options: {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					onClick: null,
					position: "bottom",
					labels: { boxWidth: 12, padding: 8 },
				},
				title: {
					display: true,
					text: "Average Duration by Stage",
					font: { size: 14, weight: "bold" },
				},
			},
			scales: {
				x: {
					stacked: true,
					beginAtZero: true,
					title: { display: true, text: "Duration (minutes)" },
				},
				y: { stacked: true, title: { display: true, text: "Stage" } },
			},
		},
	});
}
function switchStageView(mode: string): void {
	const select = document.getElementById(
		mode + "-stage-view-select",
	) as HTMLSelectElement | null;
	const titleOverlay = document.getElementById(mode + "-stage-title-overlay");
	const container = document.getElementById(mode + "-stage-container");
	if (!select || !titleOverlay || !container) return;
	const view = select.value;
	const data = dashboardData[mode];
	if (!data) return;
	const colorScheme = colors[mode];
	if (view === "over-time") {
		titleOverlay.style.display = "flex";
		container.style.paddingBottom = "28px";
		const trendData = data.stageDurationTrend?.trendData || [];
		const stageNames = data.stageDurationTrend?.stageNames || [];
		createBarTrendChart(mode, "stage", "stage-chart", trendData, stageNames, colorScheme);
	} else {
		titleOverlay.style.display = "none";
		container.style.paddingBottom = "16px";
		createStageChart(mode, data, colorScheme);
	}
}
function switchTaskView(mode: string): void {
	const select = document.getElementById(
		mode + "-task-view-select",
	) as HTMLSelectElement | null;
	const titleOverlay = document.getElementById(mode + "-task-title-overlay");
	const container = document.getElementById(mode + "-task-container");
	if (!select || !titleOverlay || !container) return;
	const view = select.value;
	const data = dashboardData[mode];
	if (!data) return;
	const colorScheme = colors[mode];
	if (view === "over-time") {
		titleOverlay.style.display = "flex";
		container.style.paddingBottom = "28px";
		const trendData = data.taskDurationTrend?.trendData || [];
		const taskNames = data.taskDurationTrend?.taskNames || [];
		createBarTrendChart(mode, "task", "task-chart", trendData, taskNames, colorScheme);
	} else {
		titleOverlay.style.display = "none";
		container.style.paddingBottom = "16px";
		createTaskChart(mode, data, colorScheme);
	}
}
function createTaskChart(mode: string, data: DashboardData, colorScheme: ColorScheme): void {
	const ctx = document.getElementById(mode + "-task-chart");
	if (!ctx) return;
	if (chartInstances[mode].task) chartInstances[mode].task.destroy();
	const stageData = data.stageTaskBreakdown || {};
	const stagePerf = data.stagePerformance || [];
	if (Object.keys(stageData).length === 0) {
		if (ctx.parentElement)
			ctx.parentElement.innerHTML =
				'<p style="padding: 20px; text-align: center; color: #605e5c;">No task data available</p>';
		return;
	}
	const allTasks: { label: string; duration: number; stageIndex: number }[] = [];
	const stageAvgDurations: Record<string, number> = {};
	stagePerf.forEach((s) => {
		stageAvgDurations[s.name] = s.avgDuration;
	});
	const stages = Object.keys(stageData).sort();
	const stageColorMap: Record<string, number> = {};
	stages.forEach((stage, idx) => {
		stageColorMap[stage] = idx;
	});
	stages.forEach((stage) => {
		const tasks = stageData[stage] || [];
		if (tasks.length === 0)
			allTasks.push({
				label: stage,
				duration: stageAvgDurations[stage] || 0,
				stageIndex: stageColorMap[stage],
			});
		else
			tasks.forEach((task) => {
				allTasks.push({
					label: stage + " › " + task.name,
					duration: task.avgDuration,
					stageIndex: stageColorMap[stage],
				});
			});
	});
	allTasks.sort((a, b) => b.duration - a.duration);
	chartInstances[mode].task = new Chart(ctx, {
		type: "bar",
		data: {
			labels: allTasks.map((t) => t.label),
			datasets: [
				{
					label: "Avg Duration (minutes)",
					data: allTasks.map((t) => t.duration),
					backgroundColor: allTasks.map(
						(t) => colorScheme.tasks[t.stageIndex % colorScheme.tasks.length],
					),
					borderWidth: 1,
				},
			],
		},
		options: {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				title: {
					display: true,
					text: "Longest Average Individual Tasks",
					font: { size: 14, weight: "bold" },
				},
			},
			scales: {
				x: {
					beginAtZero: true,
					title: { display: true, text: "Duration (minutes)" },
				},
				y: { title: { display: true, text: "Task" } },
			},
		},
	});
}
function setDisplay(id: string, value: string): void {
	const el = document.getElementById(id);
	if (el) el.style.display = value;
}
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
function renderTable(mode: string, tableType: string, builds: ProcessedBuild[]): void {
	const state = tableState[mode][tableType];
	const tbody = document.getElementById(mode + "-" + tableType + "-body");
	if (!tbody) return;
	const sortedBuilds = sortBuilds(builds, state.sort.column, state.sort.direction);
	const startIdx = (state.page - 1) * itemsPerPage;
	const endIdx = Math.min(startIdx + itemsPerPage, sortedBuilds.length);
	const pageBuilds = sortedBuilds.slice(startIdx, endIdx);
	tbody.innerHTML = pageBuilds
		.map((build) => {
			const date = new Date(build.startTime);
			const dateStr = date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
			const timeStr = date.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
				timeZoneName: "short",
			});
			const sourceCell = build.sourceUrl
				? '<a href="' +
					escapeHtml(build.sourceUrl) +
					'" target="_blank">' +
					escapeHtml(build.source) +
					"</a>"
				: escapeHtml(build.source);
			return (
				'<tr><td><a href="' +
				escapeHtml(build.url) +
				'" target="_blank">' +
				escapeHtml(String(build.id)) +
				"</a></td><td>" +
				escapeHtml(dateStr + " " + timeStr) +
				"</td><td>" +
				escapeHtml((build.duration ?? 0).toFixed(1) + "m") +
				"</td><td>" +
				sourceCell +
				"</td></tr>"
			);
		})
		.join("");
	const startEl = document.getElementById(mode + "-" + tableType + "-start");
	if (startEl) startEl.textContent = String(sortedBuilds.length > 0 ? startIdx + 1 : 0);
	const endEl = document.getElementById(mode + "-" + tableType + "-end");
	if (endEl) endEl.textContent = String(endIdx);
	updatePaginationControls(mode, tableType, builds.length);
}
function sortBuilds(
	builds: ProcessedBuild[],
	column: string,
	direction: string,
): ProcessedBuild[] {
	return [...builds].sort((a, b) => {
		let aVal: string | number | Date;
		let bVal: string | number | Date;
		switch (column) {
			case "id":
				aVal = a.id;
				bVal = b.id;
				break;
			case "date":
				aVal = new Date(a.startTime);
				bVal = new Date(b.startTime);
				break;
			case "duration":
				aVal = a.duration ?? 0;
				bVal = b.duration ?? 0;
				break;
			case "source":
				aVal = a.source;
				bVal = b.source;
				break;
			default:
				return 0;
		}
		if (aVal < bVal) return direction === "asc" ? -1 : 1;
		if (aVal > bVal) return direction === "asc" ? 1 : -1;
		return 0;
	});
}
function setupTableSorting(mode: string, tableType: string, builds: ProcessedBuild[]): void {
	const headers = document.querySelectorAll<HTMLElement>(
		"#" + mode + "-" + tableType + "-table th[data-sort]",
	);
	headers.forEach((header) => {
		header.addEventListener("click", () => {
			const column = header.dataset.sort;
			if (!column) return;
			const state = tableState[mode][tableType];
			if (state.sort.column === column)
				state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
			else {
				state.sort.column = column;
				state.sort.direction = "desc";
			}
			headers.forEach((h) => {
				h.classList.remove("sort-asc", "sort-desc");
				const icon = h.querySelector(".sort-icon");
				if (icon) icon.textContent = "↕";
			});
			header.classList.add("sort-" + state.sort.direction);
			const activeIcon = header.querySelector(".sort-icon");
			if (activeIcon) activeIcon.textContent = state.sort.direction === "asc" ? "↑" : "↓";
			state.page = 1;
			renderTable(mode, tableType, builds);
		});
	});
}
function updatePaginationControls(mode: string, tableType: string, totalItems: number): void {
	const state = tableState[mode][tableType];
	const totalPages = Math.ceil(totalItems / itemsPerPage);
	const prevBtn = document.getElementById(
		mode + "-" + tableType + "-prev",
	) as HTMLButtonElement | null;
	const nextBtn = document.getElementById(
		mode + "-" + tableType + "-next",
	) as HTMLButtonElement | null;
	if (prevBtn) prevBtn.disabled = state.page <= 1;
	if (nextBtn) nextBtn.disabled = state.page >= totalPages;
}
function prevPage(mode: string, tableType: string): void {
	const state = tableState[mode][tableType];
	if (state.page > 1) {
		state.page--;
		renderTable(
			mode,
			tableType,
			dashboardData[mode]?.[tableType === "recent" ? "recentBuilds" : "longestBuilds"] || [],
		);
	}
}
function nextPage(mode: string, tableType: string): void {
	const state = tableState[mode][tableType];
	const builds =
		dashboardData[mode]?.[tableType === "recent" ? "recentBuilds" : "longestBuilds"] || [];
	const totalPages = Math.ceil(builds.length / itemsPerPage);
	if (state.page < totalPages) {
		state.page++;
		renderTable(mode, tableType, builds);
	}
}
document.addEventListener("DOMContentLoaded", () => void loadData());
