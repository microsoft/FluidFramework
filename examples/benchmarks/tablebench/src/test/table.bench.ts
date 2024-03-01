/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeFromSchema, SharedTree, type ISharedTree } from "@fluidframework/tree";
import { SharedMatrix } from "@fluidframework/matrix";
import { benchmark, BenchmarkType, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { IChannel } from "@fluidframework/datastore-definitions";
import { generateTable, Table } from "..";
import { create, measureAttachmentSummary, measureEncodedLength } from "./utils";

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
				const tree = channel as ISharedTree;

				const view = tree.schematize({
					schema: Table,
					initialTree: () => data,
				});

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
			let tree: ISharedTree;
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

			// After each test, print the summary size information to the console.
			afterEach(() => {
				// When using a logger, Mocha suppresses 'console.log()' by default.
				// Writing directly to 'process.stdout' bypasses this suppression.
				process.stdout.write(`          Summary: ${summaryBytes} bytes\n`);
				process.stdout.write(
					`              vs row-major: ${(
						summaryBytes / rowMajorJsonBytes
					).toLocaleString(undefined, {
						maximumFractionDigits: 2,
						minimumFractionDigits: 2,
					})}x\n`,
				);
				process.stdout.write(
					`              vs col-major: ${(
						summaryBytes / colMajorJsonBytes
					).toLocaleString(undefined, {
						maximumFractionDigits: 2,
						minimumFractionDigits: 2,
					})}x\n`,
				);
			});

			it("Row-major JSON (Typical Database Baseline)", () => {
				// Row/col major sizes are precalculated before the test run.
				// Copy the value to 'summaryBytes' for reporting by 'afterEach' above.
				summaryBytes = rowMajorJsonBytes;
			});

			it("Column-major JSON (Compact REST Baseline)", () => {
				// Row/col major sizes are precalculated before the test run.
				// Copy the value to 'summaryBytes' for reporting by 'afterEach' above.
				summaryBytes = colMajorJsonBytes;
			});

			it("SharedMatrix", () => {
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
			});

			it("SharedTree", () => {
				const { channel, processAllMessages } = create(SharedTree.getFactory());
				tree = channel as ISharedTree;

				tree.schematize({
					schema: Table,
					initialTree: () => data,
				});

				processAllMessages();
				summaryBytes = measureAttachmentSummary(channel);
			});
		});
	});
});
