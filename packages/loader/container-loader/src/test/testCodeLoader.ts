/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	stringToBuffer,
	type ILayerCompatDetails,
	type IProvideLayerCompatDetails,
} from "@fluid-internal/client-utils";
import type {
	ICodeDetailsLoader,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";

import { failSometimeProxy } from "./failProxy.js";

export const createTestCodeLoader = (props?: {
	createDetachedBlob?: boolean;
	layerCompatDetails?: ILayerCompatDetails;
}): ICodeDetailsLoader => ({
	load: async () => {
		return {
			details: {
				package: "none",
			},
			module: {
				fluidExport: {
					IRuntimeFactory: {
						get IRuntimeFactory(): IRuntimeFactory {
							return this;
						},
						async instantiateRuntime(context, existing): Promise<IRuntime> {
							if (existing === false && props?.createDetachedBlob === true) {
								await context.storage.createBlob(stringToBuffer("whatever", "utf8"));
							}

							return failSometimeProxy<IRuntime & IProvideLayerCompatDetails>({
								createSummary: () => ({
									tree: {},
									type: SummaryType.Tree,
								}),
								setAttachState: () => {},
								getPendingLocalState: () => ({
									pending: [],
								}),
								ILayerCompatDetails: props?.layerCompatDetails,
							});
						},
					},
				},
			},
		};
	},
});
