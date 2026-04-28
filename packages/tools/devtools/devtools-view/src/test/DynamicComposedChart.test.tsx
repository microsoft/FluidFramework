/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { render } from "@testing-library/react";

import { DynamicComposedChart, type GraphDataSet } from "../components/graphs/index.js";

// Note: ResizeObserver is stubbed in jest.setup.cjs (required before tests run).
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

	it("renders without crashing with data", () => {
		render(<DynamicComposedChart dataSets={testDataSets} />);
	});

	it("renders without crashing without data", () => {
		render(<DynamicComposedChart dataSets={[]} />);
	});
});
