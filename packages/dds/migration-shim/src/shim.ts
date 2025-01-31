/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import {
	SharedObjectFromKernel,
	type IFluidSerializer,
	type ISharedObjectEvents,
	type ISharedObjectKind,
	type SharedKernel,
} from "@fluidframework/shared-object-base/internal";

import type { GetCommon } from "./shimFactory.js";

/**
 * Design constraints:
 *
 * There may be multiple DDSes of the same type in a single DataStore which need different migration paths.
 *
 * Handles to DDSes must dereference to the object after adaption not before.
 *
 *
 * Alternative: conversion data object layer. Migrates the DDSes inside of it, not in place (changes type, replaces DDSes).
 *
 */

/**
 * Special adapter that just returns its input.
 * @remarks
 * Using this adapter instead of some other identity function allows {@link migrate} to recognize it and perform optimizations.
 */
export function identityAdapter<T>(value: T): T {
	return value;
}

/**
 * Special adapter that indicates such an operation is unsupported.
 * @remarks
 * Using this adapter allows {@link migrate} to recognize it and avoid attempting to perform unsupported operations.
 */
export function unsupportedAdapter<T>(value: T): never {
	throw new Error("Unsupported migration");
}

/**
 *
 */
export interface MigrationOptions<
	in Before = never,
	out After = unknown,
	out Common = unknown,
> {
	/**
	 * Unique identifier for this migration.
	 */
	readonly migrationIdentifier: string;
	readonly defaultMigrated: boolean;
	readonly to: SharedKernelFactory<After>;
	beforeAdapter(from: Before): Common;
	afterAdapter(from: After): Common;

	/**
	 * Migrate all data, including non persisted things like event registrations to the new object.
	 *
	 * `from` should be left in a consistent state to support that since migration might be rolled back by discarding the new object and reusing the old.
	 */
	migrate(from: Before, to: After);
}

/**
 *
 */
export interface MigrationSet<in out TFrom> {
	readonly from: SharedKernelFactory<TFrom>;
	selector(id: string): MigrationOptions<TFrom>;
}

/**
 *
 */
export const shimInfo: unique symbol = Symbol("shimInfo");

/**
 *
 */
export interface IMigrationShim {
	readonly [shimInfo]: MigrationShimInfo;
}

interface MigrationShimInfo {
	readonly status: MigrationStatus;
	cast<const T extends MigrationOptions>(
		options: T,
	): T extends MigrationOptions<never, unknown, infer Common> ? Common : never;
}

enum MigrationStatus {
	Before,
	After,
}

/**
 * Define a SharedObjectKind to migrate from one SharedObjectKind to another.
 * @remarks
 * The returned SharedObjectKind can be used to load premigration data from documents that used `From` or `To`
 * It can also load data saved by a compatible migration shim (TODO define compatible).
 *
 * Data saved by this adapter can be loaded by `From` if it is before the migration, but after the migration it can not always be loaded by `To`:
 * the migration shim must continue to be used to load the data to ensure legacy content is properly supported.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate<T extends MigrationSet<any>>(
	options: T,
): ISharedObjectKind<GetCommon<T["selector"]> & IMigrationShim> {
	throw new Error("Not implemented");
}

interface FactoryOut<T> {
	readonly kernel: SharedKernel;
	readonly view: T;
}

/**
 * TODO: use this. Maybe move loadCore here.
 */
export interface SharedKernelFactory<T> {
	create(args: KernelArgs): FactoryOut<T>;
}

/**
 *
 */
export interface KernelArgs {
	serializer: IFluidSerializer;
	handle: IFluidHandle;
	submitMessage: (op: unknown, localOpMetadata: unknown) => void;
	isAttached: () => boolean;
	eventEmitter: TypedEventEmitter<ISharedObjectEvents>;
}

interface ShimData<TOut> extends FactoryOut<unknown> {
	readonly adapter: TOut;
	migrated?: MigrationOptions;
}

/**
 * Map which can be based on a SharedMap or a SharedTree.
 *
 * Once this has been accessed as a SharedTree, the SharedMap APIs are no longer accessible.
 *
 * TODO: events
 */
class MigrationShim<TFrom, TOut> extends SharedObjectFromKernel<ISharedObjectEvents> {
	/**
	 * If a migration is in progress (locally migrated, but migration not sequenced),
	 * this will hold the data in the format before migration.
	 *
	 * TODO: use this.
	 */
	#preMigrationData: ShimData<TOut> | undefined;

	// Lazy init here so correct kernel constructed in loadCore when loading from existing data.
	#data: ShimData<TOut> | undefined;

	private readonly kernelArgs: KernelArgs;

	/**
	 * @param id - String identifier.
	 * @param runtime - Data store runtime.
	 * @param attributes - The attributes for the map.
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		private readonly migrationSet: MigrationSet<TFrom>,
	) {
		super(id, runtime, attributes, "fluid_treeMap_");
		this.kernelArgs = {
			serializer: this.serializer,
			handle: this.handle,
			submitMessage: (op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
			isAttached: () => this.isAttached(),
			eventEmitter: this,
		};

		// Proxy which grafts the adapter's APIs onto this object.
		return new Proxy(this, {
			get: (target, prop, receiver) => {
				// Prefer `this` over adapter when there is a conflict.
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop, target);
				}
				const adapter = target.data.adapter;
				return Reflect.get(adapter as object, prop, adapter) as unknown;
			},
		});
	}

	/**
	 * Convert the underling data structure into a tree.
	 * @remarks
	 * This does not prevent the map APIs from being available:
	 * until `viewWith` is called, the map APIs are still available and will be implemented on-top of the tree structure.
	 */
	public upgrade(): void {
		// TODO: upgrade op, upgrade rebasing etc.

		const data = this.data;
		if (data.migrated !== undefined) {
			return;
		}
		const options: MigrationOptions<TFrom, unknown, TOut> = this.migrationSet.selector(
			this.id,
		) as MigrationOptions<TFrom, unknown, TOut>;
		const { kernel, view } = options.to.create(this.kernelArgs);

		options.migrate(data.view as TFrom, view);
		const adapter = options.afterAdapter(view);
		this.#data = {
			view,
			kernel: this.wrapKernel(kernel),
			adapter,
			migrated: options,
		};
	}

	private get data(): FactoryOut<unknown> & {
		readonly adapter: TOut;
		migrated?: MigrationOptions;
	} {
		if (this.#data === undefined) {
			// initialize to default format
			const options: MigrationOptions<TFrom, unknown, TOut> = this.migrationSet.selector(
				this.id,
			) as MigrationOptions<TFrom, unknown, TOut>;
			if (options.defaultMigrated) {
				// Create post migration
				const { kernel, view } = options.to.create(this.kernelArgs);
				const adapter = options.afterAdapter(view);
				this.#data = {
					view,
					kernel: this.wrapKernel(kernel),
					adapter,
					migrated: options,
				};
			} else {
				// Create pre migration
				const { kernel, view } = this.migrationSet.from.create(this.kernelArgs);
				const adapter = options.beforeAdapter(view);
				this.#data = {
					view,
					kernel: this.wrapKernel(kernel),
					adapter,
					migrated: options,
				};
			}
		}
		return this.#data;
	}

	private wrapKernel(kernel: SharedKernel): SharedKernel {
		return {
			...kernel,
			// TODO: intercept ops to handle migration cases.
		};
	}

	protected override get kernel(): SharedKernel {
		return this.data.kernel;
	}
}
