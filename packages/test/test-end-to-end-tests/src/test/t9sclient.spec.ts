/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime";
import { IContainer } from "@fluidframework/container-definitions";
import { SharedMap } from "@fluidframework/map";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITestObjectProvider, waitForContainerConnection } from "@fluidframework/test-utils";

describeNoCompat("Tinylicious client", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	it("interactive client doesn't change its client details when summarizer starts", async function () {
		// This test only applies to tinylicious
		if (provider.driver.type !== "tinylicious") {
			this.skip();
		}
		// This test validates behavior that only occurs when the summarizer is created with the same loader that created
		// the container.
		// Manually creating a summarizer (Summarizer.create()) requires passing in a loader but Tinylicious client does not
		// keep a reference to the loader it uses to create containers.
		// Instead we can tweak the summarizer heuristics for the container runtime so the summarizer spawns quickly on its
		// own, and the test doesn't have to wait for an indeterminate amoun of time (up to several second) before it
		// can validate things after the summarizer exists.

		const tinyliciousClient = new TinyliciousClient({
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: {
						...DefaultSummaryConfiguration,
						...{
							// Want the summarizer to spawn as soon as possible so we can validate properties after it spawns
							initialSummarizerDelayMs: 1,
						},
					},
				},
			},
		});

		const { container } = await tinyliciousClient.createContainer({
			initialObjects: {
				mySharedMap: SharedMap,
			},
		});

		await container.attach();

		// DO NOT DO THIS IF POSSIBLE
		// See note at the top of this test about reaching into internals.
		const internalContainer: IContainer = (container as any).INTERNAL_CONTAINER_DO_NOT_USE();
		// END - DO NOT DO THIS

		await waitForContainerConnection(internalContainer);

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

		// Wait for the summarizer to spawn
		await new Promise<void>((resolve, reject): void => {
			const memberAddedHandler = (clientId, client: IClient) => {
				if (client.details.capabilities.interactive === false) {
					// Summarizer is the one who joined
					resolve();
					internalContainer.audience.off("addMember", memberAddedHandler);
				}
			};
			internalContainer.audience.on("addMember", memberAddedHandler);
		});

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
