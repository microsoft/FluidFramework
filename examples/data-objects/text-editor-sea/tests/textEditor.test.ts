/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

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
 * Opens a new direct SEA document. Waits for the two initial users.
 *
 * @remarks Two visible user labels show that the direct SharedTree clients are connected.
 *
 * @param page - The page that opens the new document.
 */
async function openNewDocument(page: Page): Promise<void> {
	await page.goto("/", { waitUntil: "load" });
	await expect(page.getByText(/^User \d+$/)).toHaveCount(2);
	await expect(page).toHaveURL(/#[\da-f]+$/iu);
}

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

	test("loads the hashed document in another page", async ({ page }) => {
		await openNewDocument(page);
		const firstPageUser = userPanel(page, 1);
		await firstPageUser.locator("textarea").fill("Shared through the URL");

		const peerPage = await page.context().newPage();
		try {
			await peerPage.goto(page.url(), { waitUntil: "load" });
			await expect(peerPage.getByText(/^User \d+$/)).toHaveCount(2);
			const peerUser = userPanel(peerPage, 1);
			await expect(peerUser.locator("textarea")).toHaveValue("Shared through the URL");

			await peerUser.locator("textarea").fill("Edited from the second page");
			await expect(firstPageUser.locator("textarea")).toHaveValue(
				"Edited from the second page",
			);
		} finally {
			await peerPage.close();
		}
	});

	test("takes an idle summary and loads it before applying newer edits", async ({ page }) => {
		await openNewDocument(page);
		const writer = userPanel(page, 1);
		await writer.locator("textarea").fill("Included in the summary");
		await quillEditor(writer, "Formatted Quill Editor").fill("Summarized formatting");
		await quillEditor(writer, "Formatted Quill Editor").press("ControlOrMeta+A");
		await editorCard(writer, "Formatted Quill Editor")
			.getByRole("button", { name: "Bold" })
			.click();
		await expect
			.poll(async () => Number(await writer.getByTestId("summary-count").textContent()), {
				timeout: 15_000,
			})
			.toBeGreaterThan(0);
		await writer.locator("textarea").fill("Edit after the summary");
		await expect(userPanel(page, 2).locator("textarea")).toHaveValue("Edit after the summary");
		await page.reload();
		await expect(page.getByText(/^User \d+$/)).toHaveCount(2);
		await expect(page.getByText("Loaded from summary", { exact: false })).toHaveCount(2);
		await expect(userPanel(page, 1).locator("textarea")).toHaveValue("Edit after the summary");
		await expect(quillEditor(userPanel(page, 1), "Formatted Quill Editor")).toHaveText(
			"Summarized formatting",
		);
		await expect(
			quillEditor(userPanel(page, 1), "Formatted Quill Editor").locator("strong"),
		).toHaveText("Summarized formatting");
	});

	test("rebases offline edits on remote edits without replacing the open view", async ({
		page,
	}) => {
		await openNewDocument(page);
		const writer = userPanel(page, 1);
		const peer = userPanel(page, 2);
		await writer.locator("textarea").fill("Base");
		await expect(peer.locator("textarea")).toHaveValue("Base");
		await writer.getByRole("button", { name: "Disconnect", exact: true }).click();
		await writer.locator("textarea").press("End");
		await writer.locator("textarea").pressSequentially(" offline");
		await peer.locator("textarea").press("End");
		await peer.locator("textarea").pressSequentially(" remote");
		await expect(writer.getByRole("status")).toContainText("disconnected");
		await writer.getByRole("button", { name: "Reconnect", exact: true }).click();
		await expect(writer.getByRole("status")).toContainText("connected · 0 pending edits");
		await expect
			.poll(
				async () =>
					(await writer.locator("textarea").inputValue()) ===
					(await peer.locator("textarea").inputValue()),
			)
			.toBe(true);
		await expect(writer.locator("textarea")).toHaveValue(/offline/u);
		await expect(writer.locator("textarea")).toHaveValue(/remote/u);
	});

	test("automatically reconnects after socket loss and preserves edits made during the outage", async ({
		page,
	}) => {
		let offline = false;
		const sockets: { close(): void }[] = [];
		await page.routeWebSocket("**/sea/websocket", (socket) => {
			if (offline) {
				socket.close({ code: 1011, reason: "Injected offline interval" });
				return;
			}
			const server = socket.connectToServer();
			sockets.push({
				close: () => {
					server.close({ code: 1011, reason: "Injected connection loss" });
					socket.close({ code: 1011, reason: "Injected connection loss" });
				},
			});
		});
		await openNewDocument(page);
		const peerPage = await page.context().newPage();
		try {
			await peerPage.goto(page.url());
			await expect(peerPage.getByText(/^User \d+$/)).toHaveCount(2);
			const writer = userPanel(page, 1);
			const peer = userPanel(peerPage, 1);
			await writer.locator("textarea").fill("Base");
			await expect(peer.locator("textarea")).toHaveValue("Base");
			offline = true;
			for (const socket of sockets.splice(0)) socket.close();
			await expect(writer.getByRole("status")).toContainText("reconnecting");
			await writer.locator("textarea").press("End");
			await writer.locator("textarea").pressSequentially(" offline");
			await peer.locator("textarea").press("End");
			await peer.locator("textarea").pressSequentially(" remote");
			offline = false;
			await expect(writer.getByRole("status")).toContainText("connected · 0 pending edits", {
				timeout: 20_000,
			});
			await expect(writer.locator("textarea")).toHaveValue(/offline/u);
			await expect(writer.locator("textarea")).toHaveValue(/remote/u);
			await expect(peer.locator("textarea")).toHaveValue(
				await writer.locator("textarea").inputValue(),
			);
			await page.reload();
			await expect(page.getByText(/^User \d+$/)).toHaveCount(2);
			await expect(userPanel(page, 1).locator("textarea")).toHaveValue(
				await peer.locator("textarea").inputValue(),
			);
		} finally {
			await peerPage.close();
		}
	});
});
