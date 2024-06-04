/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { render, screen } from "@testing-library/react";
import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";

import { AudienceHistoryTable, type TransformedAudienceHistoryData } from "../components/index.js";

describe("AudienceHistoryTable component tests", () => {
	async function getTableBodyRows(): Promise<HTMLCollection> {
		const tableElement = await screen.findByRole("table");
		expect(tableElement.children).toHaveLength(2); // Header and body

		const tableBodyElement = tableElement.children[1];
		return tableBodyElement.children;
	}

	it("Empty list", async (): Promise<void> => {
		render(<AudienceHistoryTable audienceHistoryItems={[]} />);

		const tableBodyRows = await getTableBodyRows();
		expect(tableBodyRows).toHaveLength(0);
	});

	it("Non-empty list", async (): Promise<void> => {
		const audienceHistoryItems: TransformedAudienceHistoryData[] = [
			{
				clientId: "Foo",
				time: "yesterday",
				changeKind: "joined",
			},
			{
				clientId: "Bar",
				time: "yesterday",
				changeKind: "joined",
			},
			{
				clientId: "Foo",
				time: "today",
				changeKind: "left",
			},
		];

		render(<AudienceHistoryTable audienceHistoryItems={audienceHistoryItems} />);

		const tableBodyRows = await getTableBodyRows();
		expect(tableBodyRows).toHaveLength(3);
	});
});
