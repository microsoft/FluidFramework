/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test, type Page } from "@playwright/test";

/** Waits for the real inventory controls and an attached document identity. */
async function ready(page: Page): Promise<void> {
	await expect(page.getByRole("heading", { name: "Inventory:" })).toBeVisible();
	await expect.poll(() => new URL(page.url()).hash).not.toBe("");
}

/** Exercises creation, quantity changes, and deletion through the rendered controls. */
async function editInventory(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Add Part", exact: true }).click();
	await expect(page.locator(".counter")).toHaveCount(3);
	await page
		.locator(".counter")
		.last()
		.getByRole("button", { name: "+", exact: true })
		.click();
	await expect(page.locator(".counter_value").last()).toHaveText("1");
	await page.getByRole("button", { name: "Remove Part", exact: true }).last().click();
	await expect(page.locator(".counter")).toHaveCount(2);
	await page
		.locator(".counter")
		.first()
		.getByRole("button", { name: "+", exact: true })
		.click();
	await expect(page.locator(".counter_value").first()).toHaveText("1");
}

for (const selection of ["", "unknown", "ephemeral", "session", "sea-ephemeral"]) {
	test(`inventory controls: ${selection || "default"}`, async ({ page }, testInfo) => {
		const artifacts: string[] = [];
		const errors: string[] = [];
		page.on("request", (request) => {
			if (/\.wasm(?:\?|$)|sea-typescript_generated/u.test(request.url()))
				artifacts.push(request.url());
		});
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(`/?fluidClient=${selection}`);
		await ready(page);
		await editInventory(page);
		if (selection === "" || selection === "unknown" || selection === "session") {
			await page.reload();
			await ready(page);
			await expect(page.locator(".counter_value").first()).toHaveText("1");
		}
		if (selection === "sea-ephemeral") {
			expect(artifacts.filter((url) => /\.wasm(?:\?|$)/u.test(url))).toHaveLength(1);
			const configuration =
				process.env.SEA_LOADER_PRESET === "combined" ? "combined" : "memory";
			expect(artifacts.some((url) => url.includes(`generated_${configuration}_web`))).toBe(
				true,
			);
			await page.screenshot({ path: testInfo.outputPath("inventory-desktop.png") });
			await page.setViewportSize({ width: 390, height: 844 });
			await page.screenshot({ path: testInfo.outputPath("inventory-mobile.png") });
		} else {
			expect(artifacts).toEqual([]);
		}
		expect(errors).toEqual([]);
	});
}

for (const service of ["tinylicious", "sea-webtransport"] as const) {
	for (const compression of service === "tinylicious" ? [false] : [false, true]) {
		test(`independent inventory clients: ${service}, compression=${compression}`, async ({
			browser,
		}, testInfo) => {
			const endpoint = process.env.SEA_WEBTRANSPORT_URL;
			const certificateHash = process.env.SEA_CERTIFICATE_HASH;
			test.skip(
				service === "tinylicious"
					? process.env.INVENTORY_TEST_TINYLICIOUS !== "1"
					: endpoint === undefined ||
							endpoint === "" ||
							certificateHash === undefined ||
							certificateHash === "",
				"Requires the explicitly configured running service",
			);
			const contexts = await Promise.all([
				browser.newContext(),
				browser.newContext(),
				browser.newContext(),
			]);
			try {
				const [writerContext, peerContext, reloadContext] = contexts;
				const writer = await writerContext.newPage();
				const peer = await peerContext.newPage();
				const errors: string[] = [];
				const faviconErrors: string[] = [];
				const artifacts: string[] = [];
				writer.on("request", (request) => {
					if (/\.wasm(?:\?|$)|sea-typescript_generated/u.test(request.url()))
						artifacts.push(request.url());
				});
				for (const page of [writer, peer]) {
					page.on("pageerror", (error) => errors.push(error.message));
					page.on("console", (message) => {
						if (message.type() === "error") {
							const target =
								message.location().url === `${new URL(page.url()).origin}/favicon.ico`
									? faviconErrors
									: errors;
							target.push(message.text());
						}
					});
				}
				const query = new URLSearchParams({ fluidClient: service });
				if (service === "sea-webtransport") {
					if (endpoint === undefined || certificateHash === undefined) {
						throw new Error("SEA endpoint and certificate hash are required");
					}
					query.set("seaEndpoint", endpoint);
					query.set("seaCertificateHash", certificateHash);
					query.set("seaCompression", String(compression));
				}
				await writer.goto(
					`${process.env.INVENTORY_TEST_URL ?? "http://localhost:8091"}/?${query}`,
				);
				await ready(writer);
				await editInventory(writer);
				if (service === "sea-webtransport") {
					const capability =
						process.env.SEA_LOADER_PRESET === "combined" ? "combined" : "webtransport";
					const configuration = compression ? `${capability}-compression` : capability;
					expect(artifacts.filter((url) => /\.wasm(?:\?|$)/u.test(url))).toHaveLength(1);
					expect(
						artifacts.filter((url) => url.includes("sea-typescript_generated")),
					).toHaveLength(1);
					expect(artifacts.some((url) => url.includes(`generated_${configuration}_web`))).toBe(
						true,
					);
				} else {
					expect(artifacts).toEqual([]);
				}
				const sharedURL = writer.url();
				await peer.goto(sharedURL);
				await ready(peer);
				await expect(peer.locator(".counter_value").first()).toHaveText("1");
				await peer.getByRole("button", { name: "Add Part", exact: true }).click();
				await expect(writer.locator(".counter")).toHaveCount(3);
				await Promise.all([
					writer
						.locator(".counter")
						.first()
						.getByRole("button", { name: "+", exact: true })
						.click(),
					peer
						.locator(".counter")
						.nth(1)
						.getByRole("button", { name: "+", exact: true })
						.click(),
				]);
				for (const page of [writer, peer])
					await expect(page.locator(".counter_value")).toHaveText(["2", "1", "0"]);
				await peer.getByRole("button", { name: "Remove Part", exact: true }).last().click();
				await expect(writer.locator(".counter")).toHaveCount(2);
				await writerContext.close();
				await peerContext.close();
				const reopened = await reloadContext.newPage();
				reopened.on("pageerror", (error) => errors.push(error.message));
				await reopened.goto(sharedURL);
				await ready(reopened);
				await expect(reopened.locator(".counter_value")).toHaveText(["2", "1"]);
				expect(errors).toEqual([]);
				await testInfo.attach("service-evidence", {
					body: JSON.stringify({
						browser: browser.version(),
						environment: process.platform,
						service,
						preset: process.env.SEA_LOADER_PRESET ?? "split",
						compression,
						artifacts,
						errors,
						faviconErrors,
						independentContexts: 3,
						reopenedAfterBothClientsClosed: true,
					}),
					contentType: "application/json",
				});
			} finally {
				await Promise.all(contexts.map(async (context) => context.close()));
			}
		});
	}
}
