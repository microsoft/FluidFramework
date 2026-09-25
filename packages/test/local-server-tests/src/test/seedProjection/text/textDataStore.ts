/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { configuredSharedTree } from "@fluidframework/tree/internal";

import type { TextSeed } from "./textSeedFormat.js";
import { documentFromSeed, viewConfiguration, type TextView } from "./textTreeSchema.js";

/**
 * Application-owned registration, channel name, and root alias.
 */
export const layout = {
	storeType: "seed-text-store",
	treeId: "tree",
	alias: "root",
};

/**
 * Use the same SharedTree collaboration codec during construction and live loading.
 */
export const treeKind = configuredSharedTree({ minVersionForCollab: "2.0.0" });
const treeFactory = treeKind.getFactory();

/**
 * The loaded application model and this client's identifier-compressor session.
 */
export class SeedEntryPoint {
	public constructor(
		public readonly view: TextView,
		public readonly sessionId: string | undefined,
		public readonly storeId: string,
	) {}
}

/**
 * Supply initial content only when constructing the disconnected seed graph.
 * Ordinary clients load the existing channel and create a view without initializing its contents.
 */
export function createTextDataStoreFactory(seed?: TextSeed): IFluidDataStoreFactory {
	return {
		type: layout.storeType,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			if (!existing && seed === undefined) {
				throw new Error("Text data store creation requires initial content");
			}
			const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
				context,
				new Map([[treeFactory.type, treeFactory]]),
				existing,
				async (store) => {
					const channel = existing
						? await store.getChannel(layout.treeId)
						: store.createChannel(layout.treeId, treeFactory.type);
					if (!treeKind.is(channel)) {
						throw new Error("Expected the text application's SharedTree");
					}
					const view = channel.viewWith(viewConfiguration);
					store.once("dispose", () => view.dispose());
					if (!existing) {
						if (seed === undefined) {
							throw new Error("Text data store creation requires initial content");
						}
						view.initialize(documentFromSeed(seed));
						runtime.bind(channel.handle);
					}
					return new SeedEntryPoint(view, store.idCompressor?.localSessionId, store.id);
				},
			);
			return runtime;
		},
	};
}
