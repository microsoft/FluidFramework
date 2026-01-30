/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { Client, LocalServerStressState } from "./localServerStressHarness";

export const validateAllDataStoresSaved = async (
	clientA: Client,
	clientB: Client,
	state: LocalServerStressState,
): Promise<void> => {
	for (const client of [clientA, clientB]) {
		assert(client.container.isDirty === false, `[${client.tag}] Container is dirty!`);
		for (const entry of (
			await client.entryPoint.getContainerObjects(state.stateTracker.containerObjectsByUrl)
		).filter((v) => v.type === "stressDataObject")) {
			assert(entry.type === "stressDataObject", "type narrowing");
			const stressDataObject = entry.stressDataObject;
			assert(
				stressDataObject.isDirty === false,
				`[${client.tag}] DataObject ${stressDataObject.id} is dirty!`,
			);
		}
	}
};
