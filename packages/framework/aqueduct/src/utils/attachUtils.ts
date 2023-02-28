/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { AttachState } from "@fluidframework/container-definitions";

export async function waitForAttach(dataStoreRuntime: IFluidDataStoreRuntime): Promise<void> {
	if (dataStoreRuntime.attachState === AttachState.Attached) {
		return;
	}

	return new Promise((resolve) => {
		dataStoreRuntime.once("attached", () => {
			Promise.resolve()
				.then(() => resolve())
				.catch(() => {});
		});
	});
}
