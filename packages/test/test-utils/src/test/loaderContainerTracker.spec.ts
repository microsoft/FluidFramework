/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation -- Exercise the private comparison without constructing a loader. */

import { strict as assert } from "assert";

import type { IContainer } from "@fluidframework/container-definitions/internal";

import { LoaderContainerTracker } from "../loaderContainerTracker.js";

describe("LoaderContainerTracker sequence comparison", () => {
	/** Creates the container view consumed by the sequence comparison. */
	function container(document: string | undefined, sequence: number): IContainer {
		return {
			resolvedUrl: document === undefined ? undefined : { id: document },
			deltaManager: {
				minimumSequenceNumber: 0,
				lastSequenceNumber: sequence,
				readOnlyInfo: { readonly: true },
			},
		} as unknown as IContainer;
	}

	it("does not compare independent documents or unresolved containers", () => {
		const tracker = new LoaderContainerTracker();
		assert.equal(
			tracker["needSequenceNumberSynchronize"]([
				container("first", 3),
				container("first", 3),
				container("second", 1),
				container(undefined, 0),
				container(undefined, 4),
			]),
			undefined,
		);
	});

	it("still detects a lagging peer within one document", () => {
		const tracker = new LoaderContainerTracker();
		const lagging = container("first", 2);
		tracker["containers"].set(lagging, {
			index: 0,
			paused: false,
			startTrailingNoOps: 0,
			trailingNoOps: 0,
			lastProposal: 0,
		});
		const pending = tracker["needSequenceNumberSynchronize"]([
			lagging,
			container("first", 3),
			container("second", 1),
		]);
		assert.equal(pending?.reason, "Pending");
		assert.match(pending?.message ?? "", /sequence number 3: 0$/u);
	});
});
