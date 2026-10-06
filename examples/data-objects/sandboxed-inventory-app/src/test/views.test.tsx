/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { cleanupEphemeralService } from "@fluidframework/local-driver/alpha";
import { cleanup, render } from "@testing-library/react";
import globalJsdom from "global-jsdom";

import { GuestView } from "../guestView.js";
import { loadHost, type HostContainer } from "../host.js";
import { HostView } from "../hostView.js";

describe("Sandboxed inventory pages", () => {
	let cleanupDom: () => void;
	let container: HostContainer;

	before(async () => {
		cleanupDom = globalJsdom(undefined, {
			url: "http://localhost/?fluidClient=ephemeral",
		});
		container = await loadHost();
	});

	afterEach(cleanup);

	after(async () => {
		try {
			container?.data.dispose();
			container?.close();
			await cleanupEphemeralService();
		} finally {
			cleanupDom();
		}
	});

	for (const reactStrictMode of [false, true]) {
		describe(`StrictMode: ${reactStrictMode}`, () => {
			it("labels the Host and Guest panes", () => {
				const view = render(<HostView state={{ status: "ready", container }} />, {
					reactStrictMode,
				});
				assert.equal(view.getByRole("heading", { name: "Host" }).textContent, "Host");
				assert.equal(view.getByRole("heading", { name: "Guest" }).textContent, "Guest");
				assert.equal(view.getByRole("heading", { name: "nut" }).textContent, "nut");
			});

			it("loads the separate Guest page with only script permission", () => {
				const view = render(<HostView state={{ status: "ready", container }} />, {
					reactStrictMode,
				});
				const iframe = view.getByTitle("Guest inventory");
				assert.equal(iframe.tagName, "IFRAME");
				assert.equal(iframe.getAttribute("src"), "./guest.html");
				assert.equal(iframe.getAttribute("sandbox"), "allow-scripts");
			});

			it("does not claim Guest synchronization is connected", () => {
				const view = render(<HostView state={{ status: "ready", container }} />, {
					reactStrictMode,
				});
				assert.equal(
					view.getByText("Tree synchronization is not implemented yet.").textContent,
					"Tree synchronization is not implemented yet.",
				);
				assert.equal(view.queryAllByText("Connected", { exact: true }).length, 0);
			});

			it("shows loading guidance before mounting the Guest", () => {
				const view = render(<HostView state={{ status: "loading" }} />, {
					reactStrictMode,
				});
				assert.match(view.getByRole("status").textContent ?? "", /Connecting to document/);
				assert.equal(view.container.querySelectorAll("iframe").length, 0);
			});

			it("shows startup errors without inventory controls or a Guest iframe", () => {
				const view = render(
					<HostView state={{ status: "error", error: new Error("Host unavailable") }} />,
					{ reactStrictMode },
				);
				assert.match(view.getByRole("alert").textContent ?? "", /Host unavailable/);
				assert.equal(view.queryAllByRole("button", { name: "Add Part" }).length, 0);
				assert.equal(view.container.querySelectorAll("iframe").length, 0);
			});

			it("renders the Guest independently without a nested iframe", () => {
				const view = render(<GuestView />, { reactStrictMode });
				assert.equal(view.getByRole("heading", { name: "Guest" }).textContent, "Guest");
				assert.equal(
					view.getByText("Tree synchronization is not implemented yet.").textContent,
					"Tree synchronization is not implemented yet.",
				);
				assert.equal(view.container.querySelectorAll("iframe").length, 0);
			});
		});
	}
});
