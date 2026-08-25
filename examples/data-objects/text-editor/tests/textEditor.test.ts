/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	expect,
	test as base,
	type BrowserContext,
	type Locator,
	type Page,
} from "@playwright/test";

/**
 * Gets the panel for one simulated user.
 *
 * Each page shows multiple Fluid clients. The clients have labels such as "User 1" and "User 2".
 * The function uses the label to find the parent panel. The function does not use the random user
 * ID or the panel color.
 *
 * @param page - The page that contains the user panel.
 * @param userNumber - The number in the visible user label.
 * @returns The panel for the specified user.
 */
function userPanel(page: Page, userNumber: number): Locator {
	return page.getByText(`User ${userNumber}`, { exact: true }).locator("../..");
}

/**
 * Gets an editor card from a user panel.
 *
 * @param panel - The user panel that contains the editor card.
 * @param name - The accessible name of the editor heading button.
 * @returns The editor card that has the specified name.
 */
function editorCard(panel: Locator, name: string): Locator {
	return panel.getByRole("button", { name, exact: true }).locator("..");
}

/**
 * Gets the content-editable element that Quill creates.
 *
 * @param panel - The user panel that contains the Quill editor.
 * @param name - The accessible name of the editor heading button.
 * @returns The content-editable element in the specified editor card.
 */
function quillEditor(panel: Locator, name: string): Locator {
	return editorCard(panel, name).locator(".ql-editor");
}

/**
 * Opens a new Fluid document. Waits for the two initial users.
 *
 * @remarks The app writes the attached container ID to the URL hash. A valid hash shows that the
 * container is attached. Two visible user labels show that the initial clients are connected.
 *
 * @param page - The page that opens the new document.
 */
async function openNewDocument(page: Page): Promise<void> {
	await page.goto("/", { waitUntil: "load" });
	await expect(page).toHaveURL(/#[\dA-Za-z-]{3,64}$/);
	await expect(page.getByText(/^User \d+$/)).toHaveCount(2);
}

/**
 * Opens an additional page for an existing Fluid document.
 *
 * @param documentUrl - The URL of the Fluid document.
 * @returns The additional page after its initial users connect.
 */
type OpenCollaborationPage = (documentUrl: string) => Promise<Page>;

/**
 * Adds the `openCollaborationPage` fixture to Playwright.
 *
 * @remarks Playwright supplies the primary `page` fixture. Each call to `openCollaborationPage`
 * creates a separate browser context. Therefore, an additional page does not share browser data
 * with the primary page or with another additional page.
 *
 * The fixture closes all additional contexts after the test. The cleanup also occurs if setup,
 * navigation, or an assertion fails.
 *
 * The fixture returns a page after the second local user panel is visible. Each app page always
 * starts with two local users. A test can call the fixture more than one time.
 */
const test = base.extend<{ openCollaborationPage: OpenCollaborationPage }>({
	openCollaborationPage: async ({ browser }, use) => {
		const contexts: BrowserContext[] = [];
		await use(async (documentUrl) => {
			const context = await browser.newContext();
			// Register the context before navigation. This lets the fixture clean up after a setup error.
			contexts.push(context);
			const page = await context.newPage();
			await page.goto(documentUrl, { waitUntil: "load" });
			await expect(userPanel(page, 2)).toBeVisible();
			return page;
		});
		await Promise.all(contexts.map(async (context) => context.close()));
	},
});

test.describe("text editor", () => {
	test("boots a new document with two users and three editors", async ({ page }) => {
		await openNewDocument(page);

		for (const userNumber of [1, 2]) {
			const panel = userPanel(page, userNumber);
			await expect(panel.getByRole("button", { name: "Plain Textarea" })).toBeVisible();
			await expect(panel.getByRole("button", { name: "Plain Quill Editor" })).toBeVisible();
			await expect(
				panel.getByRole("button", { name: "Formatted Quill Editor" }),
			).toBeVisible();
			await expect(panel.getByTitle("Undo", { exact: true }).first()).toBeDisabled();
			await expect(panel.getByTitle("Redo", { exact: true }).first()).toBeDisabled();
		}

		await expect(page.getByRole("button", { name: "Devtools: Off" })).toBeVisible();
	});

	test("synchronizes Unicode plain text across editors and users", async ({ page }) => {
		await openNewDocument(page);
		const text = "Hello, Fluid! 👋";
		const user1 = userPanel(page, 1);
		const user2 = userPanel(page, 2);

		await user1.locator("textarea").fill(text);

		await expect(user1.locator("textarea")).toHaveValue(text);
		await expect(quillEditor(user1, "Plain Quill Editor")).toHaveText(text);
		await expect(user2.locator("textarea")).toHaveValue(text);
		await expect(quillEditor(user2, "Plain Quill Editor")).toHaveText(text);
		await expect(quillEditor(user1, "Formatted Quill Editor")).toBeEmpty();
		await expect(quillEditor(user2, "Formatted Quill Editor")).toBeEmpty();
	});

	test("synchronizes formatted text and inline formatting", async ({ page }) => {
		await openNewDocument(page);
		const user1 = userPanel(page, 1);
		const user2 = userPanel(page, 2);
		const user1FormattedCard = editorCard(user1, "Formatted Quill Editor");
		const user1Editor = quillEditor(user1, "Formatted Quill Editor");
		const user2Editor = quillEditor(user2, "Formatted Quill Editor");

		await user1Editor.fill("Formatted collaboration");
		await user1Editor.press("ControlOrMeta+A");
		await user1FormattedCard.getByRole("button", { name: "Bold" }).click();

		await expect(user2Editor).toHaveText("Formatted collaboration");
		await expect(user2Editor.locator("strong")).toHaveText("Formatted collaboration");
		await expect(user1.locator("textarea")).toHaveValue("");
		await expect(user2.locator("textarea")).toHaveValue("");
	});

	test("scopes editor undo and redo to plain or formatted content", async ({ page }) => {
		await openNewDocument(page);
		const user1 = userPanel(page, 1);
		const plainCard = editorCard(user1, "Plain Textarea");
		const formattedCard = editorCard(user1, "Formatted Quill Editor");
		const plainEditor = user1.locator("textarea");
		const formattedEditor = quillEditor(user1, "Formatted Quill Editor");

		await plainEditor.fill("Plain change");
		await formattedEditor.fill("Formatted change");

		await formattedCard.getByRole("button", { name: "Undo" }).click();
		await expect(formattedEditor).toBeEmpty();
		await expect(plainEditor).toHaveValue("Plain change");

		await formattedCard.getByRole("button", { name: "Redo" }).click();
		await expect(formattedEditor).toHaveText("Formatted change");

		await plainCard.getByRole("button", { name: "Undo" }).click();
		await expect(plainEditor).toHaveValue("");
		await expect(formattedEditor).toHaveText("Formatted change");
	});

	test("does not add remote edits to another user's undo history", async ({ page }) => {
		await openNewDocument(page);
		const user1 = userPanel(page, 1);
		const user2 = userPanel(page, 2);
		const user1PlainCard = editorCard(user1, "Plain Textarea");
		const user2PlainCard = editorCard(user2, "Plain Textarea");
		const user1Undo = user1PlainCard.getByRole("button", { name: "Undo" });
		const user2Undo = user2PlainCard.getByRole("button", { name: "Undo" });

		await user1.locator("textarea").fill("Local to User 1");

		await expect(user2.locator("textarea")).toHaveValue("Local to User 1");
		await expect(user1Undo).toBeEnabled();
		await expect(user2Undo).toBeDisabled();

		await user1Undo.click();
		await expect(user1.locator("textarea")).toHaveValue("");
		await expect(user2.locator("textarea")).toHaveValue("");
	});

	test("restores current content when a collapsed editor remounts", async ({ page }) => {
		await openNewDocument(page);
		const user1 = userPanel(page, 1);
		const user2 = userPanel(page, 2);
		const user2PlainQuillButton = user2.getByRole("button", {
			name: "Plain Quill Editor",
		});

		await user2PlainQuillButton.click();
		await expect(user2PlainQuillButton).toHaveAttribute("aria-expanded", "false");
		await expect(quillEditor(user2, "Plain Quill Editor")).toHaveCount(0);

		await user1.locator("textarea").fill("Changed while collapsed");
		await expect(user2.locator("textarea")).toHaveValue("Changed while collapsed");

		await user2PlainQuillButton.click();
		await expect(user2PlainQuillButton).toHaveAttribute("aria-expanded", "true");
		await expect(quillEditor(user2, "Plain Quill Editor")).toHaveText(
			"Changed while collapsed",
		);
	});

	test("adds and removes users while preserving document state", async ({ page }) => {
		await openNewDocument(page);

		await page.getByRole("button", { name: "Remove User 2" }).click();
		await expect(page.getByText(/^User \d+$/)).toHaveCount(1);
		await expect(page.getByRole("button", { name: /^Remove User/ })).toHaveCount(0);

		const user1 = userPanel(page, 1);
		await user1.locator("textarea").fill("Existing plain text");
		await quillEditor(user1, "Formatted Quill Editor").fill("Existing formatted text");

		await page.getByRole("button", { name: "+ Add user" }).click();
		await expect(page.getByText(/^User \d+$/)).toHaveCount(2);
		const addedUser = userPanel(page, 2);
		await expect(addedUser.locator("textarea")).toHaveValue("Existing plain text");
		await expect(quillEditor(addedUser, "Formatted Quill Editor")).toHaveText(
			"Existing formatted text",
		);

		await user1.locator("textarea").fill("Updated after add");
		await expect(addedUser.locator("textarea")).toHaveValue("Updated after add");
	});

	test("loads and collaborates on an existing hashed document", async ({
		openCollaborationPage,
		page,
	}) => {
		await openNewDocument(page);
		const originalUser = userPanel(page, 1);
		await originalUser.locator("textarea").fill("Persisted plain text");
		await quillEditor(originalUser, "Formatted Quill Editor").fill("Persisted formatted text");

		const secondPage = await openCollaborationPage(page.url());
		const joinedUser = userPanel(secondPage, 1);
		await expect(joinedUser.locator("textarea")).toHaveValue("Persisted plain text");
		await expect(quillEditor(joinedUser, "Formatted Quill Editor")).toHaveText(
			"Persisted formatted text",
		);

		await joinedUser.locator("textarea").fill("Edited from another context");
		await expect(originalUser.locator("textarea")).toHaveValue("Edited from another context");
	});

	test("rejects an invalid document ID", async ({ page }) => {
		await page.goto("/#not-a-valid-id!", { waitUntil: "load" });

		await expect(
			page.getByRole("heading", { name: "Failed to connect to Tinylicious" }),
		).toBeVisible();
		await expect(page.getByText(/Invalid container ID in URL hash/)).toBeVisible();
		await expect(page.getByText(/Expected 3-64 alphanumeric or '-' characters/)).toBeVisible();
	});
});
