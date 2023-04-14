/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { Summarizer } from "@fluidframework/container-runtime";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { SharedMap } from "@fluidframework/map";

describeNoCompat("Tinylicious client", (getTestObjectProvider) => {
	// Regression test for _______
	it("interactive client doesn't change its client details when summarizer starts", async function () {
		// This test validates behavior that only occurs when the summarizer is created with the same loader that created
		// the container.
		// Tinylicious client does not keep a reference to the loader, but it is passed to the Container and kept referenced
		// there, so we have to do a couple of casts to 'any' for two things:
		// - Get an IContainer from the IFluidContainer created by TinyliciousClient.
		// - Get the loader from the IContainer.
		// We can then pass the same loader that created the interactive container when creating a summarizer.

		const client = new TinyliciousClient();

		const { container } = await client.createContainer({
			initialObjects: {
				mySharedMap: SharedMap,
			},
		});

		await container.attach();

		// DO NOT DO THIS IF POSSIBLE
		// See note at the top of this test about reaching into internals.
		const internalContainer: IContainer = (container as any).INTERNAL_CONTAINER_DO_NOT_USE();
		const existingLoader: ILoader = (internalContainer as any).loader as ILoader;
		// END - DO NOT DO THIS

		const absoluteUrl = await internalContainer.getAbsoluteUrl("");
		if (absoluteUrl === undefined) {
			throw new Error("URL could not be resolved");
		}

		// Check that client details are the expected ones before the summarizer starts
		assert.equal(
			(internalContainer as any).clientDetails?.capabilities?.interactive,
			true,
			"Interactive container's capabilities do not say 'interactive: true' before creating summarizer",
		);
		assert.equal(
			(internalContainer as any).clientDetails?.capabilities?.type,
			undefined,
			"Interactive container's capabilities do not have undefined 'type' before creating summarizer",
		);

		// Create a summarizer
		const summarizer = await Summarizer.create(existingLoader, absoluteUrl);

		// Check that client details are still the expected ones *after* the summarizer starts
		assert.equal(
			(internalContainer as any).clientDetails?.capabilities?.interactive,
			true,
			"Interactive container's capabilities do not say 'interactive: true' after creating summarizer",
		);
		assert.equal(
			(internalContainer as any).clientDetails?.capabilities?.type,
			undefined,
			"Interactive container's capabilities do not have undefined 'type' after creating summarizer",
		);
	});
});
