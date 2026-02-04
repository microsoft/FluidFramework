/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { prefetchLatestSnapshot } from "@fluidframework/odsp-driver/internal";
import { FluidAppOdspUrlResolver } from "@fluidframework/odsp-urlresolver/internal";

import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { OdspSampleCache } from "./odspPersistantCache.js";

export function start(div: HTMLDivElement, odspAccessToken: string): void {
	const binaryDiv = document.createElement("div");
	binaryDiv.style.minHeight = "400px";
	const binaryText = document.createElement("div");
	binaryText.textContent = "Paste Your URL for Binary Snapshot Here";
	binaryText.style.minHeight = "25px";
	binaryText.style.marginBottom = "5px";
	binaryText.style.marginTop = "10px";
	binaryDiv.append(binaryText);

	const jsonDiv = document.createElement("div");
	jsonDiv.style.minHeight = "400px";
	const jsonText = document.createElement("div");
	jsonText.textContent = "Paste Your URL for JSON Snapshot Here";
	jsonText.style.minHeight = "25px";
	jsonText.style.marginBottom = "5px";
	jsonText.style.marginTop = "10px";
	jsonDiv.append(jsonText);

	div.append(binaryDiv);
	div.append(jsonDiv);

	const text1 = document.createElement("textarea");
	text1.cols = 150;
	text1.rows = 5;
	const fetchButton1 = document.createElement("button");
	fetchButton1.textContent = "Fetch Snapshot";
	fetchButton1.style.minWidth = "100px";
	binaryDiv.append(text1);
	binaryDiv.append(fetchButton1);

	const text2 = document.createElement("textarea");
	text2.cols = 150;
	text2.rows = 5;
	const fetchButton2 = document.createElement("button");
	fetchButton2.textContent = "Fetch Snapshot";
	jsonDiv.append(text2);
	jsonDiv.append(fetchButton2);

	const urlResolver = new FluidAppOdspUrlResolver();
	const odspPersistantCache = new OdspSampleCache();
	fetchButton1.addEventListener("click", () => {
		(async () => {
			const resolvedUrl = await urlResolver.resolve({ url: text1.value });
			assert(resolvedUrl !== undefined, "resolvedUrl should be defined");
			const mockLogger = new MockLogger();
			for (let i = 0; i < 5; ++i) {
				await prefetchLatestSnapshot(
					resolvedUrl,
					async () => odspAccessToken,
					odspPersistantCache,
					true /** forceAccessTokenViaAuthorizationHeader */,
					mockLogger,
					undefined,
				);
			}
			fetchButtonClick(mockLogger, binaryDiv);
		})().catch((error) => console.error("Error fetching snapshot:", error));
	});

	fetchButton2.addEventListener("click", () => {
		(async () => {
			const resolvedUrl = await urlResolver.resolve({ url: text2.value });
			assert(resolvedUrl !== undefined, 0x31a /* resolvedUrl is undefined */);
			const mockLogger = new MockLogger();
			for (let i = 0; i < 5; ++i) {
				await prefetchLatestSnapshot(
					resolvedUrl,
					async () => odspAccessToken,
					odspPersistantCache,
					true /** forceAccessTokenViaAuthorizationHeader */,
					mockLogger,
					undefined,
				);
			}
			fetchButtonClick(mockLogger, jsonDiv);
		})().catch((error) => console.error("Error fetching snapshot:", error));
	});
}

function fetchButtonClick(mockLogger: MockLogger, div: HTMLDivElement): void {
	const fields = new Set([
		"eventName",
		"attempts",
		"shareLinkPresent",
		"isSummarizer",
		"redeemFallbackEnabled",
		"headers",
		"sltelemetry",
		"sprequestguid",
		"driverVersion",
		"category",
	]);
	const tbl = document.createElement("table");
	tbl.style.marginTop = "20px";
	const tblBody = document.createElement("tbody");
	let count = 1;
	for (const event of mockLogger.events.entries()) {
		if (event[1].eventName.toLowerCase().includes("treeslatest_end")) {
			let row1: HTMLTableRowElement | undefined;
			if (count === 1) {
				row1 = document.createElement("tr");
			}
			const row2 = document.createElement("tr");
			for (const entry of Object.entries(event[1])) {
				if (!fields.has(entry[0])) {
					if (count === 1) {
						const cell1 = document.createElement("td");
						const cellText1 = document.createTextNode(`${entry[0]}`);
						cell1.append(cellText1);
						row1?.append(cell1);
					}
					const cell2 = document.createElement("td");
					const value = entry[1];
					const cellText2 = document.createTextNode(
						typeof value === "object" && value !== null
							? JSON.stringify(value)
							: String(value),
					);
					cell2.append(cellText2);
					row2.append(cell2);
				}
			}
			if (count === 1) {
				assert(row1 !== undefined, "row should be defined");
				tblBody.append(row1);
				count += 1;
			}
			tblBody.append(row2);
			tbl.append(tblBody);
			tbl.setAttribute("border", "2");
			div.append(tbl);
		}
	}
}
