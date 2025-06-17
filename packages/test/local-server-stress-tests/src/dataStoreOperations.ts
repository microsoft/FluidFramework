/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { Client } from "./localServerStressHarness";

export const validateAllDataStoresSaved = async (...clients: Client[]) => {
	for (const client of clients) {
		assert(client.container.isDirty === false, `[${client.tag}] Container is dirty!`);
		for (const entry of (await client.entryPoint.getContainerObjects()).filter(
			(v) => v.type === "stressDataObject",
		)) {
			assert(entry.type === "stressDataObject", "type narrowing");
			const stressDataObject = entry.stressDataObject;
			assert(
				stressDataObject.isDirty === false,
				`[${client.tag}] DataObject ${stressDataObject.id} is dirty!`,
			);
		}
	}
};
