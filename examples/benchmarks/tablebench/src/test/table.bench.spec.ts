/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BenchmarkType,
	benchmark,
	benchmarkCustom,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { IChannel } from "@fluidframework/datastore-definitions/legacy";
import { SharedMatrix } from "@fluidframework/matrix/legacy";
import { type ITree, NodeFromSchema, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/legacy";

import { Table, generateTable } from "../index.js";

import { create, measureAttachmentSummary, measureEncodedLength } from "./utils.js";

const numRows = isInPerformanceTestingMode ? 10000 : 100;

describe("Table", () => {
	const data = generateTable(numRows);

	describe(`compute over ${numRows} rows`, () => {
		let table: NodeFromSchema<typeof Table>;
		let matrix: SharedMatrix;

		let channel: IChannel;
		let processAllMessages: () => void;

		const columnNames = Object.keys(data[0]);
		const unitsSoldColumn = columnNames.indexOf("Units Sold");
		const unitPriceColumn = columnNames.indexOf("Unit Price");
		const unitCostColumn = columnNames.indexOf("Unit Cost");
		const totalRevenueColumn = columnNames.indexOf("Total Revenue");
		const totalCostColumn = columnNames.indexOf("Total Cost");
		const totalProfitColumn = columnNames.indexOf("Total Profit");

		benchmark({
			type: BenchmarkType.Measurement,
			title: `SharedMatrix`,
			before: () => {
				({ channel, processAllMessages } = create(SharedMatrix.getFactory()));
				matrix = channel as SharedMatrix;
				matrix.insertCols(0, columnNames.length);
				matrix.insertRows(0, data.length);

				for (let r = 0; r < data.length; r++) {
					for (const [c, key] of columnNames.entries()) {
						matrix.setCell(r, c, (data as any)[r][key]);
					}
				}
				processAllMessages();
			},
			benchmarkFn: () => {
				for (let r = 0; r < matrix.rowCount; r++) {
					const unitsSold = matrix.getCell(r, unitsSoldColumn) as number;
					const unitPrice = matrix.getCell(r, unitPriceColumn) as number;
					const unitCost = matrix.getCell(r, unitCostColumn) as number;

					const totalRevenue = unitsSold * unitPrice;
					const totalCost = unitsSold * unitCost;
					const totalProfit = totalRevenue - totalCost;

					matrix.setCell(r, totalRevenueColumn, totalRevenue);
					matrix.setCell(r, totalCostColumn, totalCost);
					matrix.setCell(r, totalProfitColumn, totalProfit);
				}
				processAllMessages();
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `SharedTree`,
			before: () => {
				({ channel, processAllMessages } = create(SharedTree.getFactory()));
				const tree = channel as unknown as ITree;

				const view = tree.viewWith(new TreeViewConfiguration({ schema: Table }));
				view.initialize(data);
				table = view.root;

				processAllMessages();
			},
			benchmarkFn: () => {
				for (const row of table) {
					const unitsSold = row["Units Sold"];
					const unitPrice = row["Unit Price"];
					const unitCost = row["Unit Cost"];

					const totalRevenue = unitsSold * unitPrice;
					const totalCost = unitsSold * unitCost;
					const totalProfit = totalRevenue - totalCost;

					row["Total Revenue"] = totalRevenue;
					row["Total Cost"] = totalCost;
					row["Total Profit"] = totalProfit;
				}
				processAllMessages();
			},
		});
	});

	describe(`@Size of ${numRows} rows`, () => {
		describe("attachment summary size", () => {
			let tree: ITree;
			let matrix: SharedMatrix;

			/**
			 * Transpose a table in row-major "array of objects" format to column-major "object of arrays" format.
			 * The column-major "object of arrays" form removes the redundancy of repeating column names in each row.
			 * This is used when measuring the baseline size of the table.
			 */
			function transposeTable(rows: typeof data) {
				return data.reduce(
					(cols, row) => {
						Object.entries(row).forEach(([key, value]) => {
							cols[key].push(value);
						});
						return cols;
					},
					// Create the 'cols' object, pre-initialing each row key with an empty array:
					//    { "Country": [], "Region": [], ... }
					Object.keys(rows[0]).reduce<Record<string, unknown[]>>((cols, key) => {
						cols[key] = [];
						return cols;
					}, {}),
				);
			}

			const rowMajorJsonBytes = measureEncodedLength(JSON.stringify(data));
			const colMajorJsonBytes = measureEncodedLength(JSON.stringify(transposeTable(data)));
			let summaryBytes: number;

			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: `Row-major JSON (Typical Database Baseline)`,
				run: async (reporter) => {
					summaryBytes = rowMajorJsonBytes;
					reporter.addMeasurement(`summaryBytes`, summaryBytes);
					reporter.addMeasurement(`vs row-major:`, summaryBytes / rowMajorJsonBytes);
					reporter.addMeasurement(`vs col-major:`, summaryBytes / colMajorJsonBytes);
				},
			});

			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: `Column-major JSON (Compact REST Baseline)`,
				run: async (reporter) => {
					summaryBytes = colMajorJsonBytes;
					reporter.addMeasurement(`summaryBytes`, summaryBytes);
					reporter.addMeasurement(`vs row-major:`, summaryBytes / rowMajorJsonBytes);
					reporter.addMeasurement(`vs col-major:`, summaryBytes / colMajorJsonBytes);
				},
			});

			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: `SharedMatrix`,
				run: async (reporter) => {
					const columnNames = Object.keys(data[0]);

					const { channel, processAllMessages } = create(SharedMatrix.getFactory());
					matrix = channel as SharedMatrix;
					matrix.insertCols(0, columnNames.length);
					matrix.insertRows(0, data.length);

					for (let r = 0; r < data.length; r++) {
						for (const [c, key] of columnNames.entries()) {
							matrix.setCell(r, c, (data as any)[r][key]);
						}
					}

					processAllMessages();
					summaryBytes = measureAttachmentSummary(channel);

					reporter.addMeasurement(`summaryBytes`, summaryBytes);
					reporter.addMeasurement(`vs row-major:`, summaryBytes / rowMajorJsonBytes);
					reporter.addMeasurement(`vs col-major:`, summaryBytes / colMajorJsonBytes);
				},
			});

			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: `SharedTree`,
				run: async (reporter) => {
					const { channel, processAllMessages } = create(SharedTree.getFactory());
					tree = channel;

					const view = tree.viewWith(new TreeViewConfiguration({ schema: Table }));
					view.initialize(data);

					processAllMessages();
					summaryBytes = measureAttachmentSummary(channel);

					reporter.addMeasurement(`summaryBytes`, summaryBytes);
					reporter.addMeasurement(`vs row-major:`, summaryBytes / rowMajorJsonBytes);
					reporter.addMeasurement(`vs col-major:`, summaryBytes / colMajorJsonBytes);
				},
			});
		});
	});
});
