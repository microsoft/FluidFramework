/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeFromSchema, SharedTree } from "@fluidframework/tree";
import { SharedMatrix } from "@fluidframework/matrix";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { create, processAllMessages } from "./utils";
import { generateTable } from "./data";
import { Table } from "./schema";

describe("Table", () => {
	describe("compute", () => {
		const data = generateTable(100);
		let table: NodeFromSchema<typeof Table>;
		let matrix: SharedMatrix;

		const columnNames = Object.keys(data[0]);
		const unitsSoldColumn = columnNames.indexOf("Units Sold");
		const unitPriceColumn = columnNames.indexOf("Unit Price");
		const unitCostColumn = columnNames.indexOf("Unit Cost");
		const totalRevenueColumn = columnNames.indexOf("Total Revenue");
		const totalCostColumn = columnNames.indexOf("Total Cost");
		const totalProfitColumn = columnNames.indexOf("Total Profit");

		// benchmark({
		// 	type: BenchmarkType.Measurement,
		// 	title: `SharedMatrix`,
		// 	before: () => {
		// 		matrix = create(SharedMatrix.getFactory()) as SharedMatrix;
		// 		matrix.insertCols(0, columnNames.length);
		// 		matrix.insertRows(0, data.length);

		// 		for (let r = 0; r < data.length; r++) {
		// 			for (const [c, key] of columnNames.entries()) {
		// 				matrix.setCell(r, c, (data as any)[r][key]);
		// 			}
		// 		}
		// 	},
		// 	benchmarkFn: () => {
		// 		for (let r = 0; r < matrix.rowCount; r++) {
		// 			const unitsSold = matrix.getCell(r, unitsSoldColumn) as number;
		// 			const unitPrice = matrix.getCell(r, unitPriceColumn) as number;
		// 			const unitCost = matrix.getCell(r, unitCostColumn) as number;

		// 			const totalRevenue = unitsSold * unitPrice;
		// 			const totalCost = unitsSold * unitCost;
		// 			const totalProfit = totalRevenue - totalCost;

		// 			matrix.setCell(r, totalRevenueColumn, totalRevenue);
		// 			matrix.setCell(r, totalCostColumn, totalCost);
		// 			matrix.setCell(r, totalProfitColumn, totalProfit);
		// 		}
		// 	},
		// });

		benchmark({
			type: BenchmarkType.Measurement,
			title: `SharedTree`,
			minBatchDurationSeconds: 10,
			before: () => {
				const tree = create(SharedTree.getFactory()) as SharedTree;

				const view = tree.schematize({
					schema: Table,
					initialTree: () => data,
				});

				table = view.root;
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

					processAllMessages();
				}
			},
		});
	});
});
