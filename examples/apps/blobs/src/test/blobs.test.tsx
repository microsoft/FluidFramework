/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";

import type {
	IBlobCollection,
	IBlobCollectionEvents,
	IBlobRecord,
} from "../container/index.js";
import { BlobCollectionView, DebugView } from "../view.js";

class MockBlobCollection implements IBlobCollection {
	private readonly _blobs: IBlobRecord[] = [];
	public readonly events = new TypedEventEmitter<IBlobCollectionEvents>();

	public getBlobs(): IBlobRecord[] {
		return [...this._blobs];
	}

	public addBlob(blob: Blob): void {
		const record: IBlobRecord = { id: `blob-${this._blobs.length}`, blob };
		this._blobs.push(record);
		this.events.emit("blobAdded", record);
	}
}

describe("blobs", () => {
	let cleanup: () => void;

	before(() => {
		cleanup = globalJsdom();
	});

	after(() => {
		cleanup();
	});

	describe("BlobCollectionView", () => {
		it("renders an Add blob button", () => {
			const collection = new MockBlobCollection();
			const { baseElement } = render(<BlobCollectionView blobCollection={collection} />);
			const buttons = baseElement.querySelectorAll("button");
			const hasAddBlob = [...buttons].some((btn) => btn.textContent === "Add blob");
			assert.ok(hasAddBlob, "Expected 'Add blob' button");
		});

		it("renders with no blobs initially", () => {
			const collection = new MockBlobCollection();
			const { baseElement } = render(<BlobCollectionView blobCollection={collection} />);
			const images = baseElement.querySelectorAll("img");
			assert.equal(images.length, 0, "Expected no images when collection is empty");
		});
	});

	describe("DebugView", () => {
		it("renders Attach container button when attach is provided", () => {
			let attached = false;
			const { baseElement } = render(
				<DebugView
					attach={() => {
						attached = true;
					}}
				/>,
			);
			const buttons = baseElement.querySelectorAll("button");
			const hasAttach = [...buttons].some(
				(btn) => btn.textContent?.includes("Attach container") === true,
			);
			assert.ok(hasAttach, "Expected 'Attach container' button");
			assert.equal(attached, false, "Should not have attached yet");
		});

		it("renders nothing when no attach callback is provided", () => {
			const { baseElement } = render(<DebugView />);
			assert.equal(
				baseElement.querySelectorAll("button").length,
				0,
				"Expected no buttons when attach is not provided",
			);
		});
	});
});
