/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ContainerStateTracker } from "./containerStateTracker.js";
import type { Client } from "./localServerStressHarness";

export const validateAllDataStoresSaved = async (
	stateTracker: ContainerStateTracker,
	...clients: Client[]
): Promise<void> => {
	for (const client of clients) {
		assert(client.container.isDirty === false, `[${client.tag}] Container is dirty!`);
		const containerObjects = await stateTracker.resolveAllContainerObjects(client);
		for (const entry of containerObjects) {
			if (entry.type !== "stressDataObject" || entry.datastore === undefined) {
				continue;
			}
			assert(
				entry.datastore.isDirty === false,
				`[${client.tag}] DataObject ${entry.datastore.id} is dirty!`,
			);
		}
	}
};
