/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type { IFluidDataStoreFactory, IFluidDataStoreContext, IFluidDataStorePolicies, IFluidDataStoreChannel } from "@fluidframework/runtime-definitions/internal";

/**
 * Descriptor that supplies (or can create) a model format within a multi-format data store.
 *
 * - `create`: Called only for the first descriptor when newly created (i.e. !existing) to establish initial DDSes/schema.
 * - `probe`: Used when loading an existing data store; first descriptor whose probe returns true is selected.
 * - `get`: Returns (or produces) the entry point Fluid object after selection.
 */
export interface MultiFormatModelDescriptor<TEntryPoint extends FluidObject = FluidObject> {
	/**
	 * Initialize a brand-new data store to this format (only invoked on descriptor[0] when !existing).
	 */
	create?(runtime: IFluidDataStoreRuntime): Promise<void> | void;
	/**
	 * Return true if this descriptor's format matches the persisted contents of the runtime.
	 */
	probe?(runtime: IFluidDataStoreRuntime): Promise<boolean> | boolean;
	/**
	 * Provide the entry point object for this model.
	 */
	get(runtime: IFluidDataStoreRuntime): Promise<TEntryPoint> | TEntryPoint;
}

/**
 * A minimal multi-format data store factory.
 *
 * It defers format selection until the entry point is requested. For an existing data store it runs the
 * supplied descriptors' `probe` functions in order and picks the first that matches. For a new data store
 * it eagerly invokes `create` on the first descriptor (if present) and then uses that descriptor.
 *
 * Future work: accept a richer set of options similar to `DataObjectFactoryProps`.
 */
export class MultiFormatDataStoreFactory implements IFluidDataStoreFactory {
	public readonly type: string;

	private readonly descriptors: readonly MultiFormatModelDescriptor[];
	private readonly sharedObjectRegistry: Map<string, IChannelFactory>;
	private readonly runtimeClass: typeof FluidDataStoreRuntime;
	private readonly policies?: Partial<IFluidDataStorePolicies>;

	public constructor(
		type: string,
		descriptors: readonly MultiFormatModelDescriptor[],
		sharedObjects?: readonly IChannelFactory[],
		runtimeClass: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
		policies?: Partial<IFluidDataStorePolicies>,
	) {
		if (type === "") {
			throw new Error("type must be a non-empty string");
		}
		if (descriptors.length === 0) {
			throw new Error("At least one model descriptor must be supplied");
		}
		this.type = type;
		this.descriptors = descriptors;
		this.runtimeClass = runtimeClass;
		this.policies = policies;
		this.sharedObjectRegistry = new Map(sharedObjects?.map((ext) => [ext.type, ext]));
	}

	// Provider pattern convenience (mirrors other factories in the codebase)
	public get IFluidDataStoreFactory(): this {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		let selected: MultiFormatModelDescriptor | undefined; // chosen descriptor (per-instance)

		const runtime = new this.runtimeClass(
			context,
			this.sharedObjectRegistry,
			existing,
			async (rt: IFluidDataStoreRuntime): Promise<FluidObject> => {
				// Select descriptor lazily when entry point requested.
				if (selected === undefined) {
					if (existing) {
						for (const d of this.descriptors) {
							try {
								const match = await (d.probe?.(rt) ?? false);
								if (match) {
									selected = d;
									break;
								}
							} catch {
								// Swallow probe errors and continue trying other descriptors.
							}
						}
					}
					// Fallback / new data store path: use first descriptor
					selected ??= this.descriptors[0];
				}
				if (selected === undefined) {
					throw new Error("No model descriptor selected");
				}
				return selected.get(rt);
			},
			this.policies,
		);

		// For a new data store, initialize using the first descriptor before returning the runtime.
		if (!existing) {
			const first = this.descriptors[0];
			if (first === undefined) {
				throw new Error("Invariant: descriptors array unexpectedly empty");
			}
			await first.create?.(runtime);
		}

		return runtime;
	}
}
