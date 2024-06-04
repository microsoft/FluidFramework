/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { render, screen } from "@testing-library/react";
import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";

// eslint-disable-next-line import/no-internal-modules
import { DynamicComposedChart, type GraphDataSet } from "../components/graphs/index.js";

// ResizeObserver is a hook used by Recharts that needs to be mocked for unit tests to function.
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn(),
}));
describe("DynamicComposedChart component test", () => {
	const testDataSets: GraphDataSet[] = [
		{
			graphType: "line",
			schema: {
				displayName: "Duration outbound",
				uuid: "Duration outbound",
				xAxisDataKey: "x",
				yAxisDataKey: "y",
			},
			data: [
				{ x: "12:00:00", y: 10 },
				{ x: "12:00:02", y: 15 },
				{ x: "12:00:04", y: 12 },
				{ x: "12:00:05", y: 12 },
				{ x: "12:00:06", y: 10 },
				{ x: "12:00:08", y: 11 },
			],
		},
		{
			graphType: "line",
			schema: {
				displayName: "Duration Inbound",
				uuid: "Duration Inbound",
				xAxisDataKey: "x",
				yAxisDataKey: "y",
			},
			data: [
				{ x: "12:00:00", y: 3 },
				{ x: "12:00:02", y: 1 },
				{ x: "12:00:04", y: 0 },
				{ x: "12:00:05", y: 0 },
				{ x: "12:00:06", y: 1 },
				{ x: "12:00:08", y: 1 },
			],
		},
		{
			graphType: "line",
			schema: {
				displayName: "Duration Network",
				uuid: "Duration Network",
				xAxisDataKey: "x",
				yAxisDataKey: "y",
			},
			data: [
				{ x: "12:00:00", y: 1 },
				{ x: "12:00:02", y: 0 },
				{ x: "12:00:04", y: 0 },
				{ x: "12:00:05", y: 1 },
				{ x: "12:00:06", y: 0 },
				{ x: "12:00:08", y: 0 },
			],
		},
	];

	test("renders without crashing with data", () => {
		render(<DynamicComposedChart dataSets={testDataSets} />);
		const dynamicComposedChartElement = screen.findByTestId("test-dynamic-composed-chart");
		expect(dynamicComposedChartElement).not.toBeNull();
		expect(dynamicComposedChartElement).toBeDefined();
	});

	test("renders without crashing without data", () => {
		render(<DynamicComposedChart dataSets={[]} />);
		const dynamicComposedChartElement = screen.findByTestId("test-dynamic-composed-chart");
		expect(dynamicComposedChartElement).not.toBeNull();
		expect(dynamicComposedChartElement).toBeDefined();
	});
});
