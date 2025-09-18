/* eslint-disable import/no-internal-modules -- //* TEMP */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type {
	IFluidDataStoreRuntime,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import type {
	IFluidDataStoreFactory,
	IFluidDataStoreContext,
	IFluidDataStorePolicies,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions/internal";

import type { DataObjectTypes, IDataObjectProps } from "../data-objects/types.js";

import type { DataObjectFactoryProps } from "./pureDataObjectFactory.js";

//* TODO: Do a thorough pass over PureDataObjectFactory and MultiFormatDataStoreFactory to ensure feature parity
//* e.g. MFDSF is missing the Runtime mixin
//* The idea is that if you use a single pureDataObjectModelDescriptor with this Factory, it's equivalent to PureDataObjectFactory

/**
 * Descriptor that supplies (or can create) a model format within a multi-format data store.
 *
 * - `create`: Called only for the first descriptor when newly created (i.e. !existing) to establish initial DDSes/schema.
 * - `probe`: Used when loading an existing data store; first descriptor whose probe returns true is selected.
 * - `get`: Returns (or produces) the entry point Fluid object after selection.
 */
export interface MultiFormatModelDescriptor<
	TEntryPoint extends FluidObject = FluidObject,
	I extends DataObjectTypes = DataObjectTypes,
> {
	/**
	 * Initialize a brand-new data store to this format (only invoked on descriptor[0] when !existing).
	 */
	create(props: IDataObjectProps<I>): Promise<void>; //* Would be nice to be able to have it synchronous?
	/**
	 * Return true if this descriptor's format matches the persisted contents of the runtime.
	 */
	probe(runtime: IFluidDataStoreRuntime): Promise<boolean> | boolean;
	/**
	 * Provide the entry point object for this model.
	 */
	get(props: IDataObjectProps<I>): Promise<TEntryPoint> | TEntryPoint;
	/**
	 * Shared object (DDS) factories required specifically for this model format. Multiple descriptors can
	 * contribute shared objects; duplicates (by type) are ignored with first-wins semantics.
	 *
	 * @remarks
	 * It's recommended to use delay-loaded factories for DDSes only needed for a specific format (esp old formats)
	 */
	readonly sharedObjects?: readonly IChannelFactory[];
}

/**
 * Parameter object accepted by `MultiFormatDataStoreFactory` constructor (mirrors the style of
 * `DataObjectFactoryProps` while focusing only on multi-format aspects for now).
 */
export interface MultiFormatDataStoreFactoryProps<I extends DataObjectTypes = DataObjectTypes>
	extends Omit<DataObjectFactoryProps<never, I>, "ctor" | "sharedObjects"> {
	/**
	 * Ordered list of model descriptors (first used for creation; probed in order for existing).
	 */
	readonly modelDescriptors: readonly MultiFormatModelDescriptor[];
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
	private readonly optionalProviders?: FluidObject; //* TODO: Figure out how to express this

	public constructor(props: MultiFormatDataStoreFactoryProps) {
		const { type, modelDescriptors, runtimeClass, policies, optionalProviders } = props;
		if (type === "") {
			throw new Error("type must be a non-empty string");
		}
		if (modelDescriptors.length === 0) {
			throw new Error("At least one model descriptor must be supplied");
		}
		this.type = type;
		this.descriptors = modelDescriptors;
		this.runtimeClass = runtimeClass ?? FluidDataStoreRuntime;
		this.policies = policies;
		this.optionalProviders = optionalProviders;
		// Build combined shared object registry (first descriptor wins on duplicates)
		this.sharedObjectRegistry = new Map();
		for (const d of modelDescriptors) {
			for (const so of d.sharedObjects ?? []) {
				//* BEWARE: collisions could be theoretically possible. Maybe via configuredSharedTree
				if (!this.sharedObjectRegistry.has(so.type)) {
					this.sharedObjectRegistry.set(so.type, so);
				}
			}
		}
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
		const provideEntryPoint = async (rt: IFluidDataStoreRuntime): Promise<FluidObject> => {
			// Select descriptor lazily when entry point requested.
			if (selected !== undefined) {
				// Already selected for this runtime; return its entry point immediately.
				return selected.get({
					context,
					runtime: rt,
					providers: this.optionalProviders ?? {},
					initProps: {}, //* TODO: Plumb this through
				});
			}

			if (existing) {
				for (const d of this.descriptors) {
					try {
						//* Await ensureFactoriesLoaded for the descriptor first to support delay-loading
						const match = await d.probe(rt);
						if (match) {
							selected = d;
							break;
						}
					} catch {
						// Swallow probe errors and continue trying other descriptors.
					}
				}
			} else {
				// New data store path: use first descriptor
				selected = this.descriptors[0];
			}
			//* TODO: Switch to an error with errorType.
			assert(selected !== undefined, "Should have found a model selector");

			//* TODO: Switch probe style to return the object directly rather than a boolean followed by this .get call?
			return selected.get({
				context,
				runtime: rt,
				providers: this.optionalProviders ?? {},
				initProps: {}, //* TODO: Plumb this through
			});
		};

		const runtime = new this.runtimeClass(
			context,
			this.sharedObjectRegistry,
			existing,
			provideEntryPoint,
			this.policies, //* TODO: How do we union these?
		);

		// For a new data store, initialize using the first descriptor before returning the runtime.
		if (!existing) {
			const first = this.descriptors[0];
			//* TODO: Update the type to express that there's at least one
			if (first === undefined) {
				throw new Error("Invariant: descriptors array unexpectedly empty");
			}
			await first.create({
				context,
				runtime,
				providers: this.optionalProviders ?? {},
				initProps: {}, //* TODO: Plumb this through
			});
		}

		return runtime;
	}
}
