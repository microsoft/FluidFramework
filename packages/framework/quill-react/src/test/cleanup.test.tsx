/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { toPropTreeNode } from "@fluidframework/react/internal";
import { TreeViewConfiguration } from "@fluidframework/tree";
import { independentView } from "@fluidframework/tree/alpha";
import { FormattedTextAsTree, TextAsTree } from "@fluidframework/tree/internal";
import { cleanup as rtlCleanup, render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import Quill from "quill";
import { StrictMode } from "react";

import { FormattedMainView } from "../formatted/index.js";
import { QuillMainView } from "../plain/index.js";

function createPlainRoot(text = ""): ReturnType<typeof toPropTreeNode<TextAsTree.Tree>> {
	const view = independentView(new TreeViewConfiguration({ schema: TextAsTree.Tree }));
	view.initialize(TextAsTree.Tree.fromString(text));
	return toPropTreeNode(view.root);
}

function createFormattedRoot(
	text = "",
): ReturnType<typeof toPropTreeNode<FormattedTextAsTree.Tree>> {
	const view = independentView(
		new TreeViewConfiguration({ schema: FormattedTextAsTree.Tree }),
	);
	view.initialize(FormattedTextAsTree.Tree.fromString(text));
	return toPropTreeNode(view.root);
}

describe("Quill editor unmount cleanup", () => {
	let cleanupJsdom: () => void;

	beforeEach(() => {
		cleanupJsdom = globalJsdom();
	});

	afterEach(() => {
		rtlCleanup();
		cleanupJsdom();
	});

	describe("plain text editor (MainView)", () => {
		it("initializes Quill on mount", () => {
			const { container } = render(<QuillMainView root={createPlainRoot("hello")} />);
			assert.ok(
				container.querySelector(".ql-container"),
				"Quill container should be present after mount",
			);
			assert.ok(
				container.querySelector(".ql-editor"),
				"Quill editor should be present after mount",
			);
		});

		it("unregisters the text-change listener when unmounted", () => {
			// Spy on Quill.prototype.off to track event listener removals during cleanup.
			const offCalls: unknown[] = [];
			const originalOff = Quill.prototype.off;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(Quill.prototype as any).off = function (event: unknown, ...rest: unknown[]): unknown {
				offCalls.push(event);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				return (originalOff as any).call(this, event, ...rest);
			};

			try {
				const { unmount } = render(<QuillMainView root={createPlainRoot("hello")} />);
				const callsBefore = offCalls.length;
				unmount();

				assert.ok(
					offCalls.slice(callsBefore).includes("text-change"),
					"quill.off('text-change') should be called on unmount to remove the listener",
				);
			} finally {
				Quill.prototype.off = originalOff;
			}
		});

		it("resets Quill DOM so the component can remount cleanly in React StrictMode", () => {
			// React 18 StrictMode double-invokes effects in development: mount → cleanup → remount,
			// using the same DOM node for both invocations. Without cleanup resetting quillRef and
			// clearing the container's DOM, the second mount would be skipped (quillRef still set)
			// or Quill would initialize on an already-modified div.
			const { container } = render(
				<StrictMode>
					<QuillMainView root={createPlainRoot("hello")} />
				</StrictMode>,
			);

			assert.equal(
				container.querySelectorAll(".ql-editor").length,
				1,
				"StrictMode double-invoke should produce exactly one Quill editor",
			);
		});
	});

	describe("formatted text editor (FormattedMainView)", () => {
		it("initializes Quill with Snow toolbar on mount", () => {
			const { container } = render(<FormattedMainView root={createFormattedRoot("hello")} />);
			assert.ok(
				container.querySelector(".ql-toolbar"),
				"Snow toolbar should be present after mount",
			);
			assert.ok(
				container.querySelector(".ql-editor"),
				"Quill editor should be present after mount",
			);
		});

		it("unregisters the text-change listener when unmounted", () => {
			const offCalls: unknown[] = [];
			const originalOff = Quill.prototype.off;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(Quill.prototype as any).off = function (event: unknown, ...rest: unknown[]): unknown {
				offCalls.push(event);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				return (originalOff as any).call(this, event, ...rest);
			};

			try {
				const { unmount } = render(<FormattedMainView root={createFormattedRoot("hello")} />);
				const callsBefore = offCalls.length;
				unmount();

				assert.ok(
					offCalls.slice(callsBefore).includes("text-change"),
					"quill.off('text-change') should be called on unmount to remove the listener",
				);
			} finally {
				Quill.prototype.off = originalOff;
			}
		});

		it("removes Snow toolbar and resets Quill DOM for clean remount in React StrictMode", () => {
			// The Snow theme toolbar is injected into the DOM by Quill as a sibling to the editor
			// container (outside React's control). The cleanup must explicitly remove it so that
			// StrictMode's remount doesn't produce a duplicate toolbar.
			const { container } = render(
				<StrictMode>
					<FormattedMainView root={createFormattedRoot("hello")} />
				</StrictMode>,
			);

			assert.equal(
				container.querySelectorAll(".ql-toolbar").length,
				1,
				"StrictMode double-invoke should produce exactly one Snow toolbar",
			);
			assert.equal(
				container.querySelectorAll(".ql-editor").length,
				1,
				"StrictMode double-invoke should produce exactly one Quill editor",
			);
		});
	});
});
