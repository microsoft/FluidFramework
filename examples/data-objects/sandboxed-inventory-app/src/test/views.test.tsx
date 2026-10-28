/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { cleanup, render } from "@testing-library/react";
import globalJsdom from "global-jsdom";

import { GuestView } from "../guestView.js";
import { HostView } from "../hostView.js";

describe("Sandboxed inventory pages", () => {
	let cleanupDom: () => void;

	beforeEach(() => {
		cleanupDom = globalJsdom();
	});

	afterEach(() => {
		cleanup();
		cleanupDom();
	});

	for (const reactStrictMode of [false, true]) {
		describe(`StrictMode: ${reactStrictMode}`, () => {
			it("labels the Host and Guest panes", () => {
				const view = render(<HostView />, { reactStrictMode });
				assert.equal(view.getByRole("heading", { name: "Host" }).textContent, "Host");
				assert.equal(view.getByRole("heading", { name: "Guest" }).textContent, "Guest");
			});

			it("loads the separate Guest page with only script permission", () => {
				const view = render(<HostView />, { reactStrictMode });
				const iframe = view.getByTitle("Guest inventory");
				assert.equal(iframe.tagName, "IFRAME");
				assert.equal(iframe.getAttribute("src"), "./guest.html");
				assert.equal(iframe.getAttribute("sandbox"), "allow-scripts");
			});

			it("identifies the Host as a scaffold rather than a connected session", () => {
				const view = render(<HostView />, { reactStrictMode });
				assert.equal(
					view.getByText("Tree synchronization is not implemented yet.").textContent,
					"Tree synchronization is not implemented yet.",
				);
				assert.equal(view.queryAllByText("Connected", { exact: true }).length, 0);
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
