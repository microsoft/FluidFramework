/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import {
	generateAswaHtml,
	generateStandaloneHtml,
	TEMPLATES_DIR,
} from "../../../library/buildPerf/htmlGenerator.js";
import type { BuildPerfMode } from "../../../library/buildPerf/types.js";

function makeSampleDataJson(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		generatedAt: "2024-06-01T12:00:00Z",
		summary: { totalBuilds: 10, succeeded: 9, successRate: 90, avgDuration: 45 },
		durationTrend: [],
		change3Day: 2,
		change7Day: 1,
		recentBuilds: [],
		longestBuilds: [],
		stagePerformance: [],
		stageTaskBreakdown: {},
		stageDurationTrend: { trendData: [], stageNames: [] },
		taskDurationTrend: { trendData: [], taskNames: [] },
		...overrides,
	});
}

const templatePath = `${TEMPLATES_DIR}/dashboard.ejs`;

describe("generateStandaloneHtml", () => {
	it("renders valid HTML with CSS, JS, and data inlined", () => {
		const dataJson = makeSampleDataJson();
		const html = generateStandaloneHtml(templatePath, dataJson, "public");

		expect(html).to.include("<!DOCTYPE html>");
		expect(html).to.include('<html lang="en">');
		// CSS was inlined
		expect(html).to.include("box-sizing: border-box");
		// JS was inlined
		expect(html).to.include("function switchTab(mode)");
		expect(html).to.include("function renderDashboard(mode, data)");
		// Data was inlined
		expect(html).to.include("STANDALONE_MODE = 'public'");
		expect(html).to.include("INLINED_DATA =");
	});

	it("sanitizes </script> sequences in JSON data", () => {
		const dataJson = makeSampleDataJson({
			summary: {
				totalBuilds: 1,
				succeeded: 1,
				successRate: 100,
				avgDuration: 10,
				note: "</script><script>alert('xss')</script>",
			},
		});
		const html = generateStandaloneHtml(templatePath, dataJson, "public");

		expect(html).to.not.include("</script><script>");
		expect(html).to.include("<\\/script>");
	});

	it("rejects invalid JSON", () => {
		expect(() => generateStandaloneHtml(templatePath, "not valid json", "public")).to.throw();
	});

	it("injects correct mode for public", () => {
		const dataJson = makeSampleDataJson();
		const html = generateStandaloneHtml(templatePath, dataJson, "public");

		expect(html).to.include("STANDALONE_MODE = 'public'");
	});

	it("injects correct mode for internal", () => {
		const dataJson = makeSampleDataJson();
		const html = generateStandaloneHtml(templatePath, dataJson, "internal");

		expect(html).to.include("STANDALONE_MODE = 'internal'");
	});

	it("strips tsc module wrapper from inlined JS", () => {
		const dataJson = makeSampleDataJson();
		const html = generateStandaloneHtml(templatePath, dataJson, "public");

		// tsc adds these for "type": "module" packages; htmlGenerator must strip them
		expect(html).to.not.include("export {};");
		expect(html).to.not.include('"use strict";');
		expect(html).to.not.include("sourceMappingURL");
	});

	for (const mode of ["public", "internal"] as BuildPerfMode[]) {
		it(`produces a self-contained HTML file for ${mode} mode`, () => {
			const dataJson = makeSampleDataJson();
			const html = generateStandaloneHtml(templatePath, dataJson, mode);

			// Should have opening and closing tags
			expect(html).to.include("<head>");
			expect(html).to.include("</head>");
			expect(html).to.include("<body>");
			expect(html).to.include("</body>");
			expect(html).to.include("</html>");

			// Should contain Chart.js CDN references
			expect(html).to.include("chart.js@4.4.1");
		});
	}
});

describe("generateAswaHtml", () => {
	it("renders valid HTML without inlined data", () => {
		const html = generateAswaHtml(templatePath);

		expect(html).to.include("<!DOCTYPE html>");
		expect(html).to.include('<html lang="en">');
		// CSS and JS should still be inlined
		expect(html).to.include("box-sizing: border-box");
		expect(html).to.include("function switchTab(mode)");
		// Should NOT have standalone variable declarations (the JS references these
		// in typeof checks, but the EJS should not declare them as const variables)
		expect(html).to.not.include("const STANDALONE_MODE");
		expect(html).to.not.include("const INLINED_DATA");
	});

	it("includes fetch-based data loading for both modes", () => {
		const html = generateAswaHtml(templatePath);

		expect(html).to.include('fetch("data/public-data.json")');
		expect(html).to.include('fetch("data/internal-data.json")');
	});

	it("includes tabs for both public and internal modes", () => {
		const html = generateAswaHtml(templatePath);

		expect(html).to.include("public-content");
		expect(html).to.include("internal-content");
		expect(html).to.include("switchTab('public')");
		expect(html).to.include("switchTab('internal')");
	});
});
