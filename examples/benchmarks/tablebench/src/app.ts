/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { initFluid } from "./azure.js";
import { generateTable } from "./data.js";
import { Table } from "./tree/index.js";

export { generateTable };
export { Table };

export async function initApp(): Promise<void> {
	const { view } = await initFluid();

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	document.getElementById("run")!.addEventListener("click", (): void => {
		performance.mark("start");

		for (const row of view.root) {
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

		performance.mark("end");
		const measurement = performance.measure("run", "start", "end");

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		document.getElementById("result")!.innerText = `Time: ${measurement.duration}ms`;
	});
}

initApp().catch((error) => {
	console.error(error);
});
