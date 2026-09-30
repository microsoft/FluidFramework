/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

/**
 * Gets one table view from the page.
 *
 * The example loader renders two views of the same Fluid document.
 *
 * @param page - The page that contains the table views.
 * @param index - The zero-based index of the table view.
 * @returns The specified table view.
 */
function tableView(page: Page, index: number): Locator {
	return page.getByRole("table", { name: "Fluid-based dynamic table" }).nth(index);
}

/**
 * Gets the data rows in a table view.
 *
 * @param table - The table view that contains the rows.
 * @returns The data rows. The returned locator does not include header rows.
 */
function dataRows(table: Locator): Locator {
	return table.locator("tbody tr");
}

/**
 * Gets a column header by its visible label.
 *
 * @param table - The table view that contains the column.
 * @param label - The visible column label.
 * @returns The column header that has the specified label.
 */
function columnHeader(table: Locator, label: string): Locator {
	return table.getByRole("columnheader").filter({ hasText: label });
}

test.describe("table", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
		await expect(page.getByRole("table", { name: "Fluid-based dynamic table" })).toHaveCount(
			2,
		);
	});

	test("renders the initial typed table data in both views", async ({ page }) => {
		for (const table of [tableView(page, 0), tableView(page, 1)]) {
			// The first header contains row and column controls, in addition to the three data columns.
			await expect(table.getByRole("columnheader")).toHaveCount(4);
			await expect(table.getByText("Task", { exact: true })).toBeVisible();
			await expect(table.getByText("Date", { exact: true })).toBeVisible();
			await expect(table.getByText("Completed?", { exact: true })).toBeVisible();
			await expect(dataRows(table)).toHaveCount(2);
			await expect(table.locator('input[type="text"]').nth(0)).toHaveValue("Clean laundry");
			await expect(table.locator('input[type="text"]').nth(1)).toHaveValue("Walk the dog");
			await expect(table.locator('input[type="date"]')).toHaveCount(2);
			await expect(table.getByRole("checkbox").nth(0)).toBeChecked();
			await expect(table.getByRole("checkbox").nth(1)).not.toBeChecked();
		}
	});

	test("adds and edits a row in both collaborative views", async ({ page }) => {
		const firstTable = tableView(page, 0);
		const secondTable = tableView(page, 1);

		await page.getByRole("button", { name: "Add Row" }).first().click();
		await expect(dataRows(firstTable)).toHaveCount(3);
		await expect(dataRows(secondTable)).toHaveCount(3);

		const firstNewRow = dataRows(firstTable).nth(2);
		const secondNewRow = dataRows(secondTable).nth(2);
		await firstNewRow.locator('input[type="text"]').fill("Write tests");
		await firstNewRow.locator('input[type="date"]').fill("2026-08-25");
		await firstNewRow.getByRole("checkbox").check();

		await expect(secondNewRow.locator('input[type="text"]')).toHaveValue("Write tests");
		await expect(secondNewRow.locator('input[type="date"]')).toHaveValue("2026-08-25");
		await expect(secondNewRow.getByRole("checkbox")).toBeChecked();
	});

	test("deletes a row in both collaborative views", async ({ page }) => {
		const firstTable = tableView(page, 0);
		const secondTable = tableView(page, 1);

		await dataRows(firstTable).nth(0).getByRole("button").click();

		await expect(dataRows(firstTable)).toHaveCount(1);
		await expect(dataRows(secondTable)).toHaveCount(1);
		// Check the remaining value to confirm that the selected row was deleted in both views.
		await expect(firstTable.locator('input[type="text"]')).toHaveValue("Walk the dog");
		await expect(secondTable.locator('input[type="text"]')).toHaveValue("Walk the dog");
	});

	test("adds, edits, and deletes a column in both collaborative views", async ({ page }) => {
		const firstTable = tableView(page, 0);
		const secondTable = tableView(page, 1);

		await firstTable.getByRole("columnheader").first().getByRole("button").click();
		await page.getByPlaceholder("Column Label").first().fill("Owner");
		await firstTable.getByRole("combobox").filter({ hasText: "Select hint" }).click();
		await page.getByRole("option", { name: "Text", exact: true }).click();
		await page
			.getByPlaceholder("Column Label")
			.first()
			.locator("xpath=ancestor::tr")
			.getByRole("button")
			.click();

		await expect(columnHeader(firstTable, "Owner")).toBeVisible();
		await expect(columnHeader(secondTable, "Owner")).toBeVisible();
		// Each of the two rows now has a Task input and an Owner input.
		await expect(firstTable.locator('input[type="text"]')).toHaveCount(4);
		await expect(secondTable.locator('input[type="text"]')).toHaveCount(4);

		await dataRows(firstTable).nth(0).locator('input[type="text"]').nth(1).fill("Ada");
		await expect(
			dataRows(secondTable).nth(0).locator('input[type="text"]').nth(1),
		).toHaveValue("Ada");

		await columnHeader(firstTable, "Owner").getByRole("button").first().click();
		await expect(columnHeader(firstTable, "Owner")).toHaveCount(0);
		await expect(columnHeader(secondTable, "Owner")).toHaveCount(0);
	});

	test("reorders rows in both collaborative views", async ({ page }) => {
		const firstTable = tableView(page, 0);
		const secondTable = tableView(page, 1);

		await dataRows(firstTable).nth(0).dragTo(dataRows(firstTable).nth(1));

		for (const table of [firstTable, secondTable]) {
			await expect(dataRows(table).nth(0).locator('input[type="text"]')).toHaveValue(
				"Walk the dog",
			);
			await expect(dataRows(table).nth(1).locator('input[type="text"]')).toHaveValue(
				"Clean laundry",
			);
		}
	});

	test("reorders columns in both collaborative views", async ({ page }) => {
		const firstTable = tableView(page, 0);
		const secondTable = tableView(page, 1);

		await columnHeader(firstTable, "Task").dragTo(columnHeader(firstTable, "Completed?"));

		for (const table of [firstTable, secondTable]) {
			const headers = table.getByRole("columnheader");
			// Index zero is the control column. Dragging Task to Completed? places Task after it.
			await expect(headers.nth(1).getByText("Date", { exact: true })).toBeVisible();
			await expect(headers.nth(2).getByText("Completed?", { exact: true })).toBeVisible();
			await expect(headers.nth(3).getByText("Task", { exact: true })).toBeVisible();
		}
	});
});
