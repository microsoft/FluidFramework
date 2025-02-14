/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type {
	ITelemetryContext,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { addBlobToSummary } from "@fluidframework/runtime-utils/internal";
import {
	makeSharedObjectKind,
	mergeAPIs,
	type FactoryOut,
	type IFluidSerializer,
	type ISharedObjectKind,
	type KernelArgs,
	type SharedKernel,
	type SharedKernelFactory,
	type SharedObjectKind,
	type SharedObjectOptions,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
	out After extends object = object,
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
	 * This should use editing APis which emit Ops to send the changes to remote clients.
	 *
	 * `to` is in the default initial state when this is called.
	 */
	migrate(from: Before, to: After, adaptedTo: Common): void;
}

/**
 *
 */
export interface MigrationSet<
	in out TFrom extends object = object,
	out Common = unknown,
	out After extends object = object,
> {
	readonly fromKernel: SharedKernelFactory<TFrom>;
	readonly fromSharedObject: ISharedObjectKind<unknown>;
	selector(id: string): MigrationOptions<TFrom, After, Common>;
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
	): T extends MigrationOptions<never, object, infer Common> ? Common : never;
	upgrade(): void;
}

enum MigrationStatus {
	Before,
	After,
}

interface ShimData<TOut> extends FactoryOut<object> {
	readonly adapter: TOut;
	migrated?: MigrationOptions;
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
export function makeSharedObjectAdapter<TFrom extends object, Common extends object = object>(
	migration: MigrationSet<TFrom, Common>,
): ISharedObjectKind<Common & IMigrationShim> & SharedObjectKind<Common & IMigrationShim> {
	const fromFactory = migration.fromSharedObject.getFactory();

	const kernelFactory: SharedKernelFactory<Common & IMigrationShim> = {
		create(args) {
			const shim = new MigrationShim<TFrom, Common>(args, migration);
			return {
				kernel: shim,
				view: shim.view,
			};
		},
	};

	const options: SharedObjectOptions<Common & IMigrationShim> = {
		type: fromFactory.type,
		attributes: fromFactory.attributes, // TODO: maybe these should be customized
		telemetryContextPrefix: "fluid_adapter_",
		factory: kernelFactory,
	};

	return makeSharedObjectKind<Common & IMigrationShim>(options);
}

/**
 * If op is a migration op, return the migration identifier.
 */
function opMigrationId(op: ISequencedDocumentMessage): string | undefined {
	return opMigrationIdFromContents(op.contents);
}

/**
 * If op is a migration op, return the migration identifier.
 */
function opMigrationIdFromContents(op: unknown): string | undefined {
	throw new Error("Not implemented");
}

interface LocalOpMetadata {
	migrated: MigrationPhase;
	inner: unknown;
}

enum MigrationPhase {
	Before,
	Migration,
	After,
}

/**
 * Map which can be based on a SharedMap or a SharedTree.
 *
 * Once this has been accessed as a SharedTree, the SharedMap APIs are no longer accessible.
 *
 * TODO: events
 */
class MigrationShim<TFrom extends object, TOut extends object> implements SharedKernel {
	// Lazy init here so correct kernel constructed in loadCore when loading from existing data.
	#data: ShimData<TOut> | undefined;

	private migrationSequenced: undefined | { sequenceNumber: number; clientId: string };

	private readonly migrationOptions: MigrationOptions<TFrom, object, TOut>;

	public readonly view: TOut & IMigrationShim;

	/**
	 * @param id - String identifier.
	 * @param runtime - Data store runtime.
	 * @param attributes - The attributes for the map.
	 */
	public constructor(
		public readonly kernelArgs: KernelArgs,
		public readonly migrationSet: MigrationSet<TFrom, TOut>,
	) {
		this.migrationOptions = this.migrationSet.selector(this.kernelArgs.sharedObject.id);
		const shim: MigrationShimInfo = {
			cast: <const T extends MigrationOptions>(options: T) => {
				if ((options as MigrationOptions) !== this.migrationOptions) {
					throw new UsageError("Invalid cast");
				}
				return this.view as T extends MigrationOptions<never, object, infer Common>
					? Common
					: never;
			},
			status: MigrationStatus.Before,
			upgrade: () => this.upgrade(true),
		};
		// Proxy which forwards to the current adapter's APIs.
		this.view = mergeAPIs<IMigrationShim, TOut>(
			Object.freeze({ [shimInfo]: shim }),
			() => this.data.adapter,
		);
	}
	public summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const result = this.data.kernel.summarizeCore(serializer, telemetryContext);
		if (this.migrationSequenced !== undefined) {
			addBlobToSummary(
				result,
				this.migrationOptions.migrationIdentifier,
				JSON.stringify(this.migrationSequenced),
			);
		}
		return result;
	}

	public async loadCore(storage: IChannelStorageService): Promise<void> {
		assert(this.#data === undefined, "loadCore should only be called once, and called first");

		const isMigrated = await storage.contains(this.migrationOptions.migrationIdentifier);
		// This could cause an upgrade if no beforeAdapter is provided. TODO: is that ok? Handle readonly.
		this.#data = this.init(isMigrated);
		if (isMigrated) {
			const migrationBlob = await storage.readBlob(this.migrationOptions.migrationIdentifier);
			const migrationString = bufferToString(migrationBlob, "utf8");
			// TODO: validate migration data
			const migrationData = JSON.parse(migrationString) as {
				sequenceNumber: number;
				clientId: string;
			};
			this.migrationSequenced = migrationData;

			// TODO: there does not seem to be a way to scope storage to a subpath so we can hide the migration data from it.
		}

		return this.data.kernel.loadCore(storage);
	}

	public onDisconnect(): void {
		// TODO: should this be called on old kernel after migration?
		this.data.kernel.onDisconnect();
	}

	public reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		// TODO: In the future could allow an adapter to optionally handle this case by rebasing the op into the new format.
		const meta = localOpMetadata as LocalOpMetadata;
		switch (meta.migrated) {
			case MigrationPhase.Before: {
				if (this.data.migrated !== undefined) {
					throw new Error("Cannot reSubmitCore across migration");
				}
				break;
			}
			case MigrationPhase.Migration: {
				// TODO: maybe support this?
				throw new Error("Cannot reSubmitCore migration");
			}
			case MigrationPhase.After: {
				assert(
					this.data.migrated !== undefined,
					"Ops after migration should only happen after migration",
				);
				break;
			}
			default: {
				unreachableCase(meta.migrated);
			}
		}
		this.data.kernel.reSubmitCore(content, meta.inner);
	}

	public applyStashedOp(content: unknown): void {
		// TODO: how does this interact with migration?
		this.data.kernel.applyStashedOp(content);
	}

	public processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		const migration = opMigrationId(message);
		if (migration === this.migrationOptions.migrationIdentifier) {
			if (this.migrationSequenced === undefined) {
				if (!local) {
					// TODO: migrate
				}
				assert(message.clientId !== null, "server should not migrate");
				this.migrationSequenced = {
					sequenceNumber: message.sequenceNumber,
					clientId: message.clientId,
				};
			} else {
				// Concurrent migrations. Drop this one.
				// Will also drop local ops that client made before observing the first migration ensuring loading up new DDS doesn't happen twice.
				// Maybe telemetry here?
				return;
			}
		} else {
			// If migration !== undefined here, there could be a nested adapter (Which could be supported in the future) or mismatched adapters.
			// For now, error in this case.
			assert(migration === undefined, "Mismatched migration");

			if (this.migrationSequenced === undefined) {
				// Before migration
				this.data.kernel.processCore(message, local, localOpMetadata);
			} else {
				// Already migrated
				if (
					message.referenceSequenceNumber < this.migrationSequenced.sequenceNumber &&
					message.clientId !== this.migrationSequenced.clientId
				) {
					// A migration happened that the client producing this op didn't know about (when it made this op).
					// Drop the op: migrations are first write wins.
					// Maybe telemetry here?
					// TODO: In the future could allow an adapter to optionally handle this case by rebasing the op into the new format.
					return;
				} else {
					// This op is after the migration from a client that observed the migration.
					// Must be in new format, send to new kernel:
					this.data.kernel.processCore(message, local, localOpMetadata);
				}
			}
		}
	}

	public rollback(content: unknown, localOpMetadata: unknown): void {
		// TODO: In the future could allow an adapter to optionally handle this case by rebasing the op into the new format.
		const meta = localOpMetadata as LocalOpMetadata;
		switch (meta.migrated) {
			case MigrationPhase.Before: {
				if (this.data.migrated !== undefined) {
					throw new Error("Cannot rollback across migration");
				}
				break;
			}
			case MigrationPhase.Migration: {
				throw new Error("Cannot rollback migration");
			}
			case MigrationPhase.After: {
				assert(
					this.data.migrated !== undefined,
					"Ops after migration should only happen after migration",
				);
				break;
			}
			default: {
				unreachableCase(meta.migrated);
			}
		}
		if (this.data.kernel.rollback === undefined) {
			throw new Error("rollback not supported");
		} else {
			this.data.kernel.rollback(content, meta.inner);
		}
	}

	/**
	 * Convert the underling data structure into a tree.
	 * @remarks
	 * This does not prevent the map APIs from being available:
	 * until `viewWith` is called, the map APIs are still available and will be implemented on-top of the tree structure.
	 */
	private upgrade(doEdits: boolean): void {
		// TODO: upgrade op, upgrade rebasing etc.

		const data = this.data;
		if (data.migrated !== undefined) {
			// Already migrated
			return;
		}

		const after = this.init(true);

		if (doEdits) {
			// TODO: actual op
			const op = { migration: this.migrationOptions.migrationIdentifier };
			assert(
				opMigrationIdFromContents(op) === this.migrationOptions.migrationIdentifier,
				"Migration op must have migration identifier",
			);
			this.kernelArgs.submitLocalMessage(op, {
				inner: {},
				migrated: MigrationPhase.Migration,
			} satisfies LocalOpMetadata);
			this.migrationOptions.migrate(data.view as TFrom, after.view, after.adapter);
		}

		this.#data = after;
	}

	/**
	 * Convert the underling data structure into a tree.
	 * @remarks
	 * This does not prevent the map APIs from being available:
	 * until `viewWith` is called, the map APIs are still available and will be implemented on-top of the tree structure.
	 */
	private sendUpgrade(from: TFrom, to: object, adaptedTo: TOut): void {
		// TODO: actual op
		const op = { migration: this.migrationOptions.migrationIdentifier };
		assert(
			opMigrationIdFromContents(op) === this.migrationOptions.migrationIdentifier,
			"Migration op must have migration identifier",
		);
		this.kernelArgs.submitLocalMessage(op, {
			inner: {},
			migrated: MigrationPhase.Migration,
		} satisfies LocalOpMetadata);
		this.migrationOptions.migrate(from, to, adaptedTo);
	}

	private init(migrated: boolean): FactoryOut<object> & {
		readonly adapter: TOut;
		migrated?: MigrationOptions;
	} {
		const adjustedArgs: KernelArgs = {
			...this.kernelArgs,
			submitLocalMessage: (content, localOpMetadata) => {
				this.kernelArgs.submitLocalMessage(content, {
					migrated: migrated ? MigrationPhase.After : MigrationPhase.Before,
					inner: localOpMetadata,
				} satisfies LocalOpMetadata);
			},
		};
		if (migrated) {
			// Create post migration
			const { kernel, view } = this.migrationOptions.to.create(adjustedArgs);
			const adapter = this.migrationOptions.afterAdapter(view);
			return {
				view,
				kernel,
				adapter,
				migrated: this.migrationOptions,
			};
		} else {
			const before = this.migrationSet.fromKernel.create(adjustedArgs);
			if (this.migrationOptions.beforeAdapter === unsupportedAdapter) {
				// Migrate
				assert(
					this.migrationOptions.defaultMigrated,
					"defaultMigrated must be set if no beforeAdapter",
				);
				const after = this.migrationOptions.to.create(adjustedArgs);
				const adapter = this.migrationOptions.afterAdapter(after.view);
				// TODO: handle read only case.
				this.sendUpgrade(before.view, after.view, adapter);
				return {
					view: before.view,
					kernel: before.kernel,
					adapter,
					migrated: this.migrationOptions,
				};
			} else {
				// Create pre migration

				const adapter = this.migrationOptions.beforeAdapter(before.view);
				return {
					view: before.view,
					kernel: before.kernel,
					adapter,
					migrated: this.migrationOptions,
				};
			}
		}
	}

	private get data(): FactoryOut<object> & {
		readonly adapter: TOut;
		migrated?: MigrationOptions;
	} {
		if (this.#data === undefined) {
			this.#data = this.init(this.migrationOptions.defaultMigrated);
		}
		return this.#data;
	}

	public didAttach(): void {
		this.data.kernel.didAttach?.();
	}
}
