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
	type ISnapshot,
} from "@fluidframework/driver-definitions/internal";
import { v4 as uuid } from "uuid";

import { AbsentProperty, failSometimeProxy } from "./failProxy.js";

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
		ILayerCompatDetails: compatibilityDetails ?? AbsentProperty,
	});
}

export function createTestCodeLoaderProxy(props?: {
	createDetachedBlob?: boolean;
	layerCompatDetails?: ILayerCompatDetails;
	onExistingSnapshot?: (snapshot: ISnapshot) => void;
	runtimeWithout_setConnectionStatus?: true;
	summaryBlobContent?: Uint8Array;
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
								if (existing && props?.onExistingSnapshot !== undefined) {
									const snapshot = context.snapshotWithContents;
									if (snapshot === undefined) {
										throw new Error("Existing runtime is missing its snapshot");
									}
									props.onExistingSnapshot(snapshot);
								}

								return failSometimeProxy<IRuntime & IProvideLayerCompatDetails>({
									createSummary: () => ({
										tree:
											props?.summaryBlobContent === undefined
												? {}
												: {
														binary: {
															content: props.summaryBlobContent,
															type: SummaryType.Blob,
														},
													},
										type: SummaryType.Tree,
									}),
									setAttachState: () => {},
									getPendingLocalState: () => ({
										pending: [],
									}),
									disposed: false,
									setConnectionState: props?.runtimeWithout_setConnectionStatus
										? () => {}
										: AbsentProperty,
									setConnectionStatus: props?.runtimeWithout_setConnectionStatus
										? AbsentProperty
										: () => {
												throw new Error("call not expected");
											},
									ILayerCompatDetails: props?.layerCompatDetails ?? AbsentProperty,
								});
							},
						},
					},
				},
			};
		},
	};
}
