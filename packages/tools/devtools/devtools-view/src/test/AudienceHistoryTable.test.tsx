/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import {
	AudienceHistoryTable,
	type TransformedAudienceHistoryData,
} from "../components/index.js";

import { assertNoAccessibilityViolations } from "./utils/index.js";

describe("AudienceHistoryTable component tests", () => {
	async function getTableBodyRows(): Promise<HTMLCollection> {
		const tableElement = await screen.findByRole("table");
		assert.strictEqual(tableElement.children.length, 2); // Header and body

		const tableBodyElement = tableElement.children[1];
		return tableBodyElement.children;
	}

	it("Empty list", async (): Promise<void> => {
		render(<AudienceHistoryTable audienceHistoryItems={[]} />);

		const tableBodyRows = await getTableBodyRows();
		assert.strictEqual(tableBodyRows.length, 0);
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
		assert.strictEqual(tableBodyRows.length, 3);
	});
});

describe("AudienceHistoryTable Accessibility Check", () => {
	it("AudienceHistoryTable is accessible", async () => {
		const { container } = render(<AudienceHistoryTable audienceHistoryItems={[]} />);
		await assertNoAccessibilityViolations(container);
	});

	it("Can tab/arrow navigate through AudienceHistoryTable", async () => {
		render(<AudienceHistoryTable audienceHistoryItems={[]} />);
		const user = userEvent.setup();
		await user.tab();
		const tooltip = screen.getByRole("button", { name: /client id/i });
		assert.strictEqual(document.activeElement, tooltip);
	});
});
