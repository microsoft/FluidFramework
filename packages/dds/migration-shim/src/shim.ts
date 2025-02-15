/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { type Static, Type } from "@sinclair/typebox";
// This export is documented as supported in typebox's documentation.
// eslint-disable-next-line import/no-internal-modules
import { TypeCompiler } from "@sinclair/typebox/compiler";

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
	 *
	 * TODO: How should this handle local ops? Copy state from before local ops, then rebase them?
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
 * Symbol used to store {@link IMigrationShim} on SharedObjects undergoing migrations.
 * @beta
 */
export const shimInfo: unique symbol = Symbol("shimInfo");

/**
 * Information about migration status.
 * @beta
 */
export interface IMigrationShim {
	readonly [shimInfo]: MigrationShimInfo;
}

/**
 * Information about migration status.
 * @beta
 */
export interface MigrationShimInfo {
	readonly status: MigrationStatus;
	// TODO: expose MigrationOptions (possibly type erased) to make this safe to package export.
	// cast<const T extends MigrationOptions>(
	// 	options: T,
	// ): T extends MigrationOptions<never, object, infer Common> ? Common : never;
	cast<const T extends never>(options: T): unknown;
	upgrade(): void;
}

/**
 * Information about migration status.
 * @beta
 */
export enum MigrationStatus {
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

		async loadCore(
			args: KernelArgs,
			storage: IChannelStorageService,
		): Promise<FactoryOut<Common & IMigrationShim>> {
			const shim = new MigrationShim<TFrom, Common>(args, migration);
			await shim.loadCore(storage);
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
 * Randomly generated UUIDv4 to help ensure no non-migration op is ever accidentally interpreted as a migration op.
 */
const migrationTag = "26f3e70a-2e99-4d09-8923-5538f05a051a";

/**
 * A migration op.
 * @remarks
 * This is the format used for migration ops, and thus they can be stored in trailing ops for unlimited amounts of time.
 * Thus changes to this must be extremely carefully considered for compatibility.
 */
const MigrationOp = Type.Object(
	{
		/**
		 * Type key intentionally collides with how SharedMap ops do types in a way to make non-adapter maps error reasonably.
		 */
		type: Type.Const("migration" as const),

		/**
		 * Unique identifier for this migration.
		 * @remarks
		 * Since a given DDS may have multiple migrations, this is used to detect which migration this op is for.
		 */
		id: Type.String(),

		/**
		 * Of the migration system being used.
		 * @remarks
		 * Integer, counting up from one.
		 * Every time a possibly breaking change is made to how migrations are handled.
		 */
		version: Type.Number({ minimum: 1, multipleOf: 1 }),

		migrationTag: Type.Const<typeof migrationTag>(migrationTag),
	},
	{ additionalProperties: false },
);

type MigrationOp = Static<typeof MigrationOp>;

const compiledMigrationOp = TypeCompiler.Compile(MigrationOp);

/**
 * If op is a migration op, return the migration identifier.
 */
function opMigrationIdFromContents(op: unknown): string | undefined {
	if (typeof op === "object" && op !== null) {
		const tag = (op as MigrationOp).migrationTag;
		if (tag === migrationTag) {
			const validated = compiledMigrationOp.Check(op);
			assert(validated, "Unsupported migration op format");
			assert(op.version === 1, "Unsupported migration version");
			return op.id;
		}
	}
	return undefined;
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
		// eslint-disable-next-line unicorn/consistent-function-scoping
		const getStatus = (): MigrationStatus =>
			this.data.migrated === undefined ? MigrationStatus.Before : MigrationStatus.After;
		const shim: MigrationShimInfo = {
			cast: <const T extends MigrationOptions>(options: T) => {
				if ((options as MigrationOptions) !== this.migrationOptions) {
					throw new UsageError("Invalid cast");
				}
				return this.view as T extends MigrationOptions<never, object, infer Common>
					? Common
					: never;
			},
			get status(): MigrationStatus {
				return getStatus();
			},
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

		const migrated = await storage.contains(this.migrationOptions.migrationIdentifier);

		// This could cause an upgrade if no beforeAdapter is provided. TODO: is that ok? Handle readonly.
		this.#data = await this.initLoadCore(migrated, storage);
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
				// TODO: how do we detect/handle ops which happened between initial migration and reSubmit?
				// Maybe need to track local pending ops as well as remove sequenced ops during migration directly?
				this.kernelArgs.submitLocalMessage(content, meta);
				return;
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
		const meta = localOpMetadata as LocalOpMetadata | undefined;
		const migration = opMigrationId(message);
		if (migration === this.migrationOptions.migrationIdentifier) {
			if (this.migrationSequenced === undefined) {
				if (!local) {
					this.upgrade(false);
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
				this.data.kernel.processCore(message, local, meta?.inner);
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
					this.data.kernel.processCore(message, local, meta?.inner);
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
		const data = this.data;
		if (data.migrated !== undefined) {
			// Already migrated
			return;
		}

		const after = this.init(true);

		if (doEdits) {
			this.sendUpgrade(data.view as TFrom, after.view, after.adapter);
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
		const op: MigrationOp = {
			id: this.migrationOptions.migrationIdentifier,
			migrationTag,
			version: 1,
			type: "migration",
		};
		assert(
			opMigrationIdFromContents(op) === this.migrationOptions.migrationIdentifier,
			"Migration op must have migration identifier",
		);
		this.kernelArgs.submitLocalMessage(op, {
			inner: {},
			migrated: MigrationPhase.Migration,
		} satisfies LocalOpMetadata);
		// Signal the new kernel that it is attached, so it should emit ops.
		// Doing this now (before migration) means that the edits migration does to initialize the kernel are sent as ops.
		// That means only one client has to do the conversion, making the conversion itself not required to be deterministic.
		// TODO: consider an alternative where the migration is run on every client (and attach happens after) as part of the migration op.
		// This might be better from an events perspective.
		// It would be a big change to how local ops during the migration (which thus need rebase) work.
		if (this.kernelArgs.sharedObject.isAttached()) {
			this.data.kernel.didAttach?.();
		}
		this.migrationOptions.migrate(from, to, adaptedTo);
	}

	private adjustedKernelArgs(migrated: boolean): KernelArgs {
		return {
			...this.kernelArgs,
			submitLocalMessage: (content, localOpMetadata) => {
				this.kernelArgs.submitLocalMessage(content, {
					migrated: migrated ? MigrationPhase.After : MigrationPhase.Before,
					inner: localOpMetadata,
				} satisfies LocalOpMetadata);
			},
		};
	}

	private finishInit<T extends object>(
		data: FactoryOut<T>,
		migrated: MigrationOptions | undefined,
		adapterFunction: (from: T) => TOut,
	): ShimData<TOut> {
		// Create pre migration
		if (this.kernelArgs.sharedObject.isAttached()) {
			data.kernel.didAttach?.();
		}
		const adapter = adapterFunction(data.view);
		return {
			view: data.view,
			kernel: data.kernel,
			adapter,
			migrated,
		};
	}

	private async initLoadCore(
		migrated: boolean,
		storage: IChannelStorageService,
	): Promise<ShimData<TOut>> {
		if (migrated) {
			// Create post migration
			const after = await this.migrationOptions.to.loadCore(
				this.adjustedKernelArgs(true),
				storage,
			);
			return this.finishInit(after, this.migrationOptions, (view) =>
				this.migrationOptions.afterAdapter(view),
			);
		} else {
			const before = await this.migrationSet.fromKernel.loadCore(
				this.adjustedKernelArgs(false),
				storage,
			);
			if (this.migrationOptions.beforeAdapter === unsupportedAdapter) {
				// Migrate
				assert(
					this.migrationOptions.defaultMigrated,
					"defaultMigrated must be set if no beforeAdapter",
				);
				const after = this.migrationOptions.to.create(this.adjustedKernelArgs(true));
				// TODO: document and test read only case
				return this.finishInit(after, this.migrationOptions, (view) => {
					const adapter = this.migrationOptions.afterAdapter(view);
					this.sendUpgrade(before.view, after.view, adapter);
					return adapter;
				});
			} else {
				// Create pre migration
				return this.finishInit(
					before,
					undefined,
					this.migrationOptions.beforeAdapter.bind(this.migrationOptions),
				);
			}
		}
	}

	private init(migrated: boolean): ShimData<TOut> {
		if (migrated) {
			// Create post migration
			const after = this.migrationOptions.to.create(this.adjustedKernelArgs(true));
			return this.finishInit(after, this.migrationOptions, (view) =>
				this.migrationOptions.afterAdapter(view),
			);
		} else {
			const before = this.migrationSet.fromKernel.create(this.adjustedKernelArgs(false));
			if (this.migrationOptions.beforeAdapter === unsupportedAdapter) {
				// Migrate
				assert(
					this.migrationOptions.defaultMigrated,
					"defaultMigrated must be set if no beforeAdapter",
				);
				const after = this.migrationOptions.to.create(this.adjustedKernelArgs(true));
				// TODO: document and test read only case
				return this.finishInit(after, this.migrationOptions, (view) => {
					const adapter = this.migrationOptions.afterAdapter(view);
					this.sendUpgrade(before.view, after.view, adapter);
					return adapter;
				});
			} else {
				// Create pre migration
				return this.finishInit(
					before,
					undefined,
					this.migrationOptions.beforeAdapter.bind(this.migrationOptions),
				);
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
