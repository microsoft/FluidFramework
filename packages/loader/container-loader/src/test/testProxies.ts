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
import {
	SummaryType,
	type IDocumentServiceFactory,
	type IDocumentService,
	type IDocumentStorageService,
	type IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { v4 as uuid } from "uuid";

import { failSometimeProxy } from "./failProxy.js";

export function createTestDocumentServiceFactoryProxy(
	resolvedUrl: IResolvedUrl,
	compatibilityDetails?: ILayerCompatDetails,
): IDocumentServiceFactory {
	return failSometimeProxy<IDocumentServiceFactory & IProvideLayerCompatDetails>({
		createContainer: async () =>
			failSometimeProxy<IDocumentService>({
				policies: {},
				resolvedUrl,
				connectToStorage: async () =>
					failSometimeProxy<IDocumentStorageService>({
						createBlob: async () => ({ id: uuid() }),
					}),
			}),
		ILayerCompatDetails: compatibilityDetails,
	});
}

export function createTestCodeLoaderProxy(props?: {
	createDetachedBlob?: boolean;
	layerCompatDetails?: ILayerCompatDetails;
}): ICodeDetailsLoader {
	return {
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
									disposed: false,
									setConnectionState: () => {},
									ILayerCompatDetails: props?.layerCompatDetails,
								});
							},
						},
					},
				},
			};
		},
	};
}
