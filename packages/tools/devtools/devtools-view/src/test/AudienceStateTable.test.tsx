/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { AudienceStateTable, type TransformedAudienceStateData } from "../components/index.js";

import { assertNoAccessibilityViolations } from "./utils/index.js";

describe("AudienceStateTable Accessibility Check", () => {
	const populatedItems: TransformedAudienceStateData[] = [
		{
			clientId: "client-1",
			userId: "user-1",
			mode: "write",
			scopes: ["doc:read", "doc:write"],
			myClientConnection: undefined,
		},
	];

	for (const audienceStateItems of [[], populatedItems]) {
		it(`Defines accessible column headers for ${audienceStateItems.length === 0 ? "an empty" : "a populated"} table`, async () => {
			const { container } = render(
				<AudienceStateTable audienceStateItems={audienceStateItems} />,
			);
			const table = screen.getByRole<HTMLTableElement>("table", {
				name: "Audience state table",
			});
			const columnNames = ["Client ID", "User ID", "Mode", "Scopes"];
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
			assert.equal(rows.length, audienceStateItems.length);
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
		it(`Opens each header tooltip with the ${key === " " ? "Space" : "Enter"} key`, async () => {
			render(<AudienceStateTable audienceStateItems={[]} />);

			const user = userEvent.setup();
			for (const name of [/client id/i, /user id/i, /mode/i, /scopes/i]) {
				await user.tab();
				const tooltipButton = screen.getByRole("button", { name });
				assert.equal(document.activeElement, tooltipButton);
				await user.keyboard(key);
				await screen.findByRole("note");
				await user.keyboard("{Escape}");
				await waitFor(() => assert.equal(screen.queryByRole("note"), null));
			}
		});
	}
});
