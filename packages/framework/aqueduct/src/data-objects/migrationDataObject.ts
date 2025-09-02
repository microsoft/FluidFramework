/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	IFluidDataStoreRuntime,
	IChannel,
} from "@fluidframework/datastore-definitions/internal";
import { SharedDirectory, type ISharedDirectory } from "@fluidframework/map/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { SharedTree, type ITree } from "@fluidframework/tree/internal";

import type { IDelayLoadChannelFactory } from "../channel-factories/index.js";

import { dataObjectRootDirectoryId } from "./dataObject.js";
import { PureDataObject } from "./pureDataObject.js";
import { treeChannelId } from "./treeDataObject.js";
import type { DataObjectTypes } from "./types.js";

/**
 * Descriptor for a model shape (arbitrary schema) the migration data object can probe for
 * or create when initializing. The probe function may inspect multiple channels or other
 * runtime state to determine whether the model exists and return a model instance.
 */
export interface ModelDescriptor<T = unknown> {
	// Discriminated union tag
	type?: string;
	// Optional convenience id for simple channel-backed models
	id?: string;
	//* This mechanism feels a bit brittle or overly generic. Maybe each model needs a key channel or something? Or maybe it's ok.
	//* See Craig's DDS shim branch for an example of tagging migrations
	// Probe runtime for an existing model based on which channels exist. Return the model instance or undefined if not found.
	probe: (runtime: IFluidDataStoreRuntime) => Promise<T | undefined> | T | undefined;
	// Factory to create the model when initializing a new store.
	create: (runtime: IFluidDataStoreRuntime) => Promise<T> | T;
	// Optional runtime type guard to help callers narrow model types.
	is?: (m: unknown) => m is T;
}

/**
 * This base class provides an abstraction between a Data Object's internal data access API
 * and the underlying Fluid data model.  Any number of data models may be supported, for
 * perma-back-compat scenarios where the component needs to be ready to load any version
 * from data at rest.
 * @experimental
 * @legacy
 * @alpha
 */
export abstract class MigrationDataObject<
	M = unknown,
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<I> {
	// The currently active model and its descriptor, if discovered or created.
	#activeModel: { descriptor: ModelDescriptor; model: M } | undefined;

	/**
	 * Probeable candidate roots the implementer expects for existing stores.
	 * The order defines probing priority.
	 */
	protected abstract get modelCandidates(): Exclude<ModelDescriptor<M>[], []>;

	/**
	 * Descriptor used to create the new root when initializing a non-existing store.
	 * If undefined, no root will be created by this base class.
	 */
	protected abstract get modelCreator(): ModelDescriptor<M> | undefined;

	/**
	 * Returns the active model descriptor and channel after initialization.
	 * Throws if initialization did not set a model.
	 */
	public getModel(): { descriptor: ModelDescriptor<M>; model: M } {
		assert(this.#activeModel !== undefined, "Expected an active model to be defined");
		return {
			descriptor: this.#activeModel.descriptor as ModelDescriptor<M>,
			model: this.#activeModel.model,
		};
	}

	/**
	 * Walks the model candidates in order and finds the first one that probes successfully.
	 * Sets the active model if found, otherwise leaves it undefined.
	 */
	private async refreshRoot(): Promise<void> {
		this.#activeModel = undefined;

		for (const descriptor of this.modelCandidates ?? []) {
			try {
				const maybe = await descriptor.probe(this.runtime);
				if (maybe !== undefined) {
					this.#activeModel = { descriptor, model: maybe };
					return;
				}
			} catch {
				// probe error for this candidate; continue to next candidate
			}
		}
	}

	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			await this.refreshRoot();
		} else {
			const creator = this.modelCreator;
			if (creator !== undefined) {
				// Note: implementer is responsible for binding any root channels and populating initial content on the created model
				const created = await creator.create(this.runtime);
				if (created !== undefined) {
					this.#activeModel = { descriptor: creator, model: created };
				}
			}
		}

		await super.initializeInternal(existing);
	}

	// Backwards-compatibility helpers (optional for implementers):
	// Implementers may provide RootDescriptor helpers for common types like SharedTree/SharedDirectory
	// rather than implementing create/runtime probing themselves.
}

/**
 * Helper to build a simple channel-backed model descriptor where the model is an object
 * containing the single channel under `channel` key. The caller provides an id and a
 * runtime type guard for the underlying channel, and optionally a create factory.
 */
export function channelBackedDescriptor<T extends IChannel = IChannel>(opts: {
	id: string;
	name?: string;
	probeTypeGuard: (ch: IChannel) => ch is T;
	createFactory?: (runtime: IFluidDataStoreRuntime) => Promise<T> | T;
}): ModelDescriptor<{ channel: T }> {
	return {
		type: opts.name,
		id: opts.id,
		probe: async (runtime) => {
			try {
				const ch = await runtime.getChannel(opts.id);
				if (opts.probeTypeGuard(ch)) {
					return { channel: ch };
				}
			} catch {
				return undefined;
			}
		},
		create: async (runtime) => {
			if (!opts.createFactory) {
				throw new Error("No create factory provided for channel-backed descriptor");
			}
			const c = await opts.createFactory(runtime);
			// bind if possible
			const maybeShared = c as unknown as Partial<ISharedObject>;
			if (
				maybeShared.bindToContext !== undefined &&
				typeof maybeShared.bindToContext === "function"
			) {
				maybeShared.bindToContext();
			}
			return { channel: c };
		},
		is: (m): m is { channel: T } => !!(m && (m as unknown as Record<string, unknown>).channel),
	};
}

/**
 * Convenience descriptor for SharedDirectory-backed models using the standard root id.
 */
export function sharedDirectoryDescriptor(): ModelDescriptor<{ directory: ISharedDirectory }> {
	return {
		type: "sharedDirectory",
		id: dataObjectRootDirectoryId,
		probe: async (runtime) => {
			try {
				const ch = await runtime.getChannel(dataObjectRootDirectoryId);
				const rec = ch as unknown as Record<string, unknown>;
				if (rec !== undefined && "get" in rec && "set" in rec) {
					// rough duck-typing for SharedDirectory
					return { directory: ch as ISharedDirectory };
				}
			} catch {
				return undefined;
			}
		},
		create: (runtime) => {
			const d = SharedDirectory.create(runtime, dataObjectRootDirectoryId);
			d.bindToContext();
			return { directory: d };
		},
		is: (m): m is { directory: ISharedDirectory } =>
			!!(m && (m as unknown as Record<string, unknown>).directory),
	};
}

/**
 * Convenience descriptor for SharedTree-backed models using the standard tree channel id
 * and a delay-load factory.
 */
export function sharedTreeDescriptor(
	factory: IDelayLoadChannelFactory<ITree>,
): ModelDescriptor<{ tree: ITree }> {
	return {
		type: "sharedTree",
		id: treeChannelId,
		probe: async (runtime) => {
			try {
				const ch = await runtime.getChannel(treeChannelId);
				if (SharedTree.is(ch)) {
					return { tree: ch as ITree };
				}
			} catch {
				return undefined;
			}
		},
		create: async (runtime) => {
			const t = await factory.createAsync(runtime, treeChannelId);
			const maybeShared = t as unknown as Partial<ISharedObject>;
			if (
				maybeShared.bindToContext !== undefined &&
				typeof maybeShared.bindToContext === "function"
			) {
				maybeShared.bindToContext();
			}
			return { tree: t };
		},
		is: (m): m is { tree: ITree } => !!(m && (m as unknown as Record<string, unknown>).tree),
	};
}
