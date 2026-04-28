/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BenchmarkType,
	type CollectedData,
	ValueType,
	benchmarkDuration,
	benchmarkIt,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { IChannel } from "@fluidframework/datastore-definitions/legacy";
import { SharedMatrix } from "@fluidframework/matrix/legacy";
import {
	type ITree,
	NodeFromSchema,
	TreeAlpha,
	TreeViewConfiguration,
} from "@fluidframework/tree/alpha";
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

		benchmarkIt({
			title: `SharedMatrix`,
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					({ channel, processAllMessages } = create(SharedMatrix.getFactory()));
					matrix = channel as SharedMatrix;
					matrix.insertCols(0, columnNames.length);
					matrix.insertRows(0, data.length);

					for (let r = 0; r < data.length; r++) {
						for (const [c, key] of columnNames.entries()) {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: Use real types
							matrix.setCell(r, c, (data as any)[r][key]);
						}
					}
					processAllMessages();
					state.timeAllBatches(() => {
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
					});
				},
			}),
		});

		benchmarkIt({
			title: `SharedTree`,
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					({ channel, processAllMessages } = create(SharedTree.getFactory()));
					const tree = channel as unknown as ITree;

					const view = tree.viewWith(new TreeViewConfiguration({ schema: Table }));
					view.initialize(data);
					table = view.root;

					processAllMessages();
					state.timeAllBatches(() => {
						// Batching these updates in a transaction gives a about a 3x performance boost
						TreeAlpha.context(table).runTransaction(() => {
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
						});
						processAllMessages();
					});
				},
			}),
		});
	});

	describe(`@Size of ${numRows} rows`, () => {
		describe("attachment summary size", () => {
			/**
			 * Transpose a table in row-major "array of objects" format to column-major "object of arrays" format.
			 * The column-major "object of arrays" form removes the redundancy of repeating column names in each row.
			 * This is used when measuring the baseline size of the table.
			 */
			function transposeTable(rows: typeof data): Record<string, unknown[]> {
				// eslint-disable-next-line unicorn/no-array-reduce
				return data.reduce(
					(cols, row) => {
						for (const [key, value] of Object.entries(row)) {
							cols[key].push(value);
						}
						return cols;
					},
					// Create the 'cols' object, pre-initialing each row key with an empty array:
					//    { "Country": [], "Region": [], ... }
					// eslint-disable-next-line unicorn/no-array-reduce
					Object.keys(rows[0]).reduce<Record<string, unknown[]>>((cols, key) => {
						cols[key] = [];
						return cols;
					}, {}),
				);
			}

			const rowMajorJsonBytes = measureEncodedLength(JSON.stringify(data));
			const colMajorJsonBytes = measureEncodedLength(JSON.stringify(transposeTable(data)));

			function summarySizeResult(bytes: number): CollectedData {
				return [
					{
						name: `summaryBytes`,
						value: bytes,
						units: `bytes`,
						type: ValueType.SmallerIsBetter,
						significance: `Primary` as const,
					},
					{ name: `vs row-major:`, value: bytes / rowMajorJsonBytes },
					{ name: `vs col-major:`, value: bytes / colMajorJsonBytes },
				] as const;
			}

			benchmarkIt({
				type: BenchmarkType.Perspective,
				title: `Row-major JSON (Typical Database Baseline)`,
				run: () => summarySizeResult(rowMajorJsonBytes),
			});

			benchmarkIt({
				type: BenchmarkType.Perspective,
				title: `Column-major JSON (Compact REST Baseline)`,
				run: () => summarySizeResult(colMajorJsonBytes),
			});

			benchmarkIt({
				title: `SharedMatrix`,
				run: () => {
					const columnNames = Object.keys(data[0]);

					const { channel, processAllMessages } = create(SharedMatrix.getFactory());
					const matrix = channel as SharedMatrix;
					matrix.insertCols(0, columnNames.length);
					matrix.insertRows(0, data.length);

					for (let r = 0; r < data.length; r++) {
						for (const [c, key] of columnNames.entries()) {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: Use real types
							matrix.setCell(r, c, (data as any)[r][key]);
						}
					}

					processAllMessages();
					return summarySizeResult(measureAttachmentSummary(channel));
				},
			});

			benchmarkIt({
				title: `SharedTree`,
				run: () => {
					const { channel, processAllMessages } = create(SharedTree.getFactory());
					const tree = channel as ITree;

					const view = tree.viewWith(new TreeViewConfiguration({ schema: Table }));
					view.initialize(data);

					processAllMessages();
					return summarySizeResult(measureAttachmentSummary(channel));
				},
			});
		});
	});
});
