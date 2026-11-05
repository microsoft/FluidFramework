/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import {
	AudienceHistoryTable,
	type TransformedAudienceHistoryData,
} from "../components/index.js";

import { assertNoAccessibilityViolations } from "./utils/index.js";

describe("AudienceHistoryTable component tests", () => {
	async function getTableBodyRows(): Promise<HTMLCollection> {
		const tableElement = await screen.findByRole("table");
		assert.equal(tableElement.children.length, 2); // Header and body

		const tableBodyElement = tableElement.children[1];
		return tableBodyElement.children;
	}

	it("Empty list", async (): Promise<void> => {
		render(<AudienceHistoryTable audienceHistoryItems={[]} />);

		const tableBodyRows = await getTableBodyRows();
		assert.equal(tableBodyRows.length, 0);
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
		assert.equal(tableBodyRows.length, 3);
	});
});

describe("AudienceHistoryTable Accessibility Check", () => {
	const populatedItems: TransformedAudienceHistoryData[] = [
		{ clientId: "client-1", time: "yesterday", changeKind: "joined" },
		{ clientId: "client-1", time: "today", changeKind: "left" },
	];

	for (const audienceHistoryItems of [[], populatedItems]) {
		it(`Defines accessible column headers for ${audienceHistoryItems.length === 0 ? "an empty" : "a populated"} table`, async () => {
			const { container } = render(
				<AudienceHistoryTable audienceHistoryItems={audienceHistoryItems} />,
			);
			const table = screen.getByRole<HTMLTableElement>("table", {
				name: "Audience history table",
			});
			const columnNames = ["Event", "Client ID", "Time"];
			const headers = within(table).getAllByRole("columnheader");
			assert.equal(headers.length, columnNames.length);

			for (const [index, header] of headers.entries()) {
				assert.equal(header.parentElement, table.tHead?.rows[0]);
				assert.equal(
					within(table).getByRole("columnheader", { name: new RegExp(columnNames[index]) }),
					header,
				);
			}

			const rows = [...table.tBodies[0].rows];
			assert.equal(rows.length, audienceHistoryItems.length);
			for (const row of rows) {
				const cells = within(row).getAllByRole<HTMLTableCellElement>("cell");
				assert.equal(cells.length, headers.length);
				for (const [index, cell] of cells.entries()) {
					assert.equal(cell.tagName, "TD");
					assert.equal(cell.cellIndex, index);
				}
			}

			await assertNoAccessibilityViolations(container);
		}).timeout(10000);
	}

	for (const key of ["{Enter}", " "]) {
		it(`Opens the header tooltip with the ${key === " " ? "Space" : "Enter"} key`, async () => {
			render(<AudienceHistoryTable audienceHistoryItems={[]} />);
			const user = userEvent.setup();
			await user.tab();
			const tooltipButton = screen.getByRole("button", { name: /client id/i });
			assert.equal(document.activeElement, tooltipButton);
			await user.keyboard(key);
			await screen.findByRole("note");
			await user.keyboard("{Escape}");
			await waitFor(() => assert.equal(screen.queryByRole("note"), null));
		}).timeout(10000);
	}
});
