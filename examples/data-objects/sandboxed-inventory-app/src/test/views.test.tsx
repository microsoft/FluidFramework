/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { cleanupEphemeralService } from "@fluidframework/local-driver/alpha";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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
				const src = iframe.getAttribute("src");
				assert(src !== null);
				assert.equal(new URL(src).pathname, "/guest.html");
				assert.equal(iframe.getAttribute("sandbox"), "allow-scripts");
			});

			it("keeps the Host editable while the Guest is still connecting", () => {
				const view = render(<HostView state={{ status: "ready", container }} />, {
					reactStrictMode,
				});
				const nut = container.data.root.parts[0];
				assert(nut !== undefined);
				const initialQuantity = nut.quantity;
				assert.equal(
					view.getByRole("status", { name: "Guest connection" }).textContent,
					"Connecting",
				);
				assert.equal(view.queryAllByText("Connected", { exact: true }).length, 0);
				try {
					fireEvent.click(view.getByRole("button", { name: "Increase nut quantity" }));
					assert.equal(nut.quantity, initialQuantity + 1);
					assert.equal(
						view.getByLabelText("nut quantity").textContent,
						String(initialQuantity + 1),
					);
					assert.equal(
						view.getByRole("status", { name: "Guest connection" }).textContent,
						"Connecting",
					);
				} finally {
					act(() => {
						nut.quantity = initialQuantity;
					});
				}
			});

			it("shows Guest setup failures while keeping the Host inventory editable", () => {
				const originalRandomUUID = crypto.randomUUID;
				crypto.randomUUID = () => {
					throw new Error("Session identifier unavailable");
				};
				try {
					const view = render(<HostView state={{ status: "ready", container }} />, {
						reactStrictMode,
					});
					assert.match(
						view.getByRole("alert").textContent ?? "",
						/Session identifier unavailable/,
					);
					assert.equal(view.getByRole("button", { name: "Add Part" }).textContent, "Add Part");
					assert.equal(view.container.querySelectorAll("iframe").length, 0);
				} finally {
					crypto.randomUUID = originalRandomUUID;
				}
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
				const view = render(<GuestView state={{ status: "connecting" }} />, {
					reactStrictMode,
				});
				assert.equal(view.getByRole("heading", { name: "Guest" }).textContent, "Guest");
				assert.equal(view.getByRole("status").textContent, "Connecting to Host...");
				assert.equal(view.container.querySelectorAll("iframe").length, 0);
			});

			it("renders Guest inventory and removes its controls on failure", () => {
				const view = render(<GuestView state={{ status: "ready", view: container.data }} />, {
					reactStrictMode,
				});
				assert.equal(view.getByLabelText("nut quantity").textContent, "0");
				view.rerender(
					<GuestView state={{ status: "error", error: new Error("Guest failed") }} />,
				);
				assert.match(view.getByRole("alert").textContent ?? "", /Guest failed/);
				assert.equal(view.queryAllByRole("button").length, 0);
			});
		});
	}
});
