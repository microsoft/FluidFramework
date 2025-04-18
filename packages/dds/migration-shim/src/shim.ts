/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
	ISequencedMessageEnvelope,
	IExperimentalIncrementalSummaryContext,
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
	in Before extends object = never,
	out After extends object = object,
	out Common = unknown,
> {
	/**
	 * Unique identifier for this migration.
	 */
	readonly migrationIdentifier: string;
	readonly defaultMigrated: boolean;

	/**
	 * Used to create the "after" kernel when loading from summary after the migration.
	 */
	readonly to: SharedKernelFactory<After>; // Pick<SharedKernelFactory<After>, "loadCore">;

	beforeAdapter(from: Before): Common;
	afterAdapter(from: After): Common;

	/**
	 * Migrate all data, including non persisted things like event registrations to the new object.
	 *
	 * This should use editing APIs which emit Ops to send the changes to remote clients.
	 *
	 * `to` is in the default initial state when this is called.
	 *
	 * This is for doing the migration as a local op:
	 * when the first migration is sequenced (there might be multiple concurrent migrations) `migrated` will be called.
	 *
	 * This approach reduces the risk of clients desynchronizing due to handling the migration differently when triggered locally vs remotely.
	 *
	 * All event registrations should be moved to the new object.
	 *
	 *
	 * TODO: Make this allocate kernel so it can handle existing pending local ops. Or customize "to"?
	 */
	migrate(from: Before, to: After, adaptedTo: Common): void;
	// migrate(from: FactoryOut<Before>, adaptedTo: Common): FactoryOut<After>;

	/**
	 * A migration op has just been sequenced.
	 *
	 * `migrate` will always be called first. On clients not initiating a migration, this will be done immediately before `migrated`,
	 * but on clients initiating a migration there may be some time and ops between.
	 *
	 * During a concurrent migration, its possible that the migration that triggered migrate was a local request to migrate,
	 * but another clients remote migration was sequenced first, resulting in this call.
	 */
	migrated(from: FactoryOut<Before>, to: FactoryOut<After>, adaptedTo: Common): void;

	/**
	 * Migration has passed out of the collab window: no more "before" ops will be applied or resubmitted.
	 *
	 * All "before" pending local ops should have been sequenced (or resubmitted as after ops) by now.
	 *
	 * TODO: how does this relate to stashed ops?
	 */
	// migrationFinalized(to: FactoryOut<After>, adaptedTo: Common): void;

	/**
	 * An op was sequenced from a client that has not observed the migration when this client has already migrated.
	 *
	 * Iff the migration has already been sequenced, `before` will be undefined.
	 */
	applyOpDuringMigration(
		to: FactoryOut<After>,
		adaptedTo: Common,
		beforeOp: IRuntimeMessageCollection,
	): void;

	/**
	 * An op from before migration needs resubmit.
	 */
	resubmitOpDuringMigration(
		to: FactoryOut<After>,
		adaptedTo: Common,
		beforeOp: { content: unknown; localOpMetadata: unknown },
	): void;

	// TODO: stashed ops
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
 *
 * Warning: Actually "alpha" and unstable, but shared between alpha and legacy+alpha APIs so it has to be public to build.
 * @alpha
 */
export const shimInfo: unique symbol = Symbol("shimInfo");

/**
 * Information about migration status.
 * @alpha
 */
export interface IMigrationShim {
	readonly [shimInfo]: MigrationShimInfo;
}

/**
 * Information about migration status.
 * @alpha
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
 * @alpha
 */
export enum MigrationStatus {
	Before,
	After,
}

interface ShimData<TOut> extends FactoryOut<object> {
	readonly adapter: TOut;

	/**
	 * Migration status related to sequenced ops.
	 * @remarks
	 * This part is what gets serialized in the summary thats not from the delegated kernels.
	 */
	readonly migrationSequenced: SequencedMigrationStatus;

	/**
	 * Local state related to migration.
	 * @remarks
	 * Set when local state is migrated (includes pending local migration or sequenced remote migration)
	 */
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
function opMigrationId(op: IRuntimeMessagesContent): string | undefined {
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
	Before = "Before",
	Migration = "Migration",
	After = "After",
}

const PendingClients = Type.Object({
	/**
	 * sequence number of the first migration op.
	 */
	first: Type.Number(),

	/**
	 * Clients who have sequenced a migration op.
	 */
	migrated: Type.Array(Type.String(), {
		minItems: 1,
	}),
});

const MigrationSummary = Type.Object(
	{
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

		/**
		 * If undefined, the migration has passed the collaboration window: all ops are in the new format.
		 *
		 * If specified, lists clients which have had a migration sequenced.
		 * @remarks
		 * This is used to determine if a given op is from a client that has observed a migration and thus in the new format.
		 */
		pendingClients: Type.Optional(PendingClients),
	},
	{ additionalProperties: false },
);

type PendingClients = Static<typeof PendingClients>;
type MigrationSummary = Static<typeof MigrationSummary>;

const compiledMigrationSummary = TypeCompiler.Compile(MigrationSummary);

/**
 * Tracks migration related state.
 * @remarks
 * Contains no "local" state related to local ops: tracks only state derived from sequenced ops.
 * This separation helps ensure this is consistent across all clients.
 */
class SequencedMigrationStatus {
	/**
	 * The first migration sequenced (lowest sequenceNumber) if any.
	 */
	private migrationSequenced:
		| undefined
		| {
				migratedAt: number;
				/**
				 * Each client which has sequenced a migration op, mapped to the sequence number of that op.
				 * @remarks
				 * See {@link MigrationSummary.pendingClients}.
				 */
				allSequencedMigrations: Set<string>;
		  }
		| true;

	private latestSequenceNumber: number;

	public constructor(
		pendingMigrations: PendingClients | undefined | true,
		/**
		 * The minimum sequence number for all connected clients.
		 * @remarks
		 * Use only for validation of inputs into sequenceOp, and to know when to stop tracking migration ops.
		 */
		private minimumSequenceNumber: number = Number.NEGATIVE_INFINITY,

		/**
		 * The reference sequence number the message was sent relative to.
		 * @remarks
		 * Use only for validation of inputs into sequenceOp.
		 */
		latestSequenceNumber?: number,
	) {
		if (pendingMigrations === undefined) {
			this.migrationSequenced = undefined;
			this.latestSequenceNumber = latestSequenceNumber ?? minimumSequenceNumber;
		} else if (pendingMigrations === true) {
			this.migrationSequenced = true;
			this.latestSequenceNumber = latestSequenceNumber ?? minimumSequenceNumber;
		} else {
			this.latestSequenceNumber = latestSequenceNumber ?? pendingMigrations.first;
			this.migrationSequenced = {
				migratedAt: pendingMigrations.first,
				allSequencedMigrations: new Set(pendingMigrations.migrated),
			};
			assert(this.latestSequenceNumber >= pendingMigrations.first, "Invalid sequence number");

			if (this.minimumSequenceNumber >= this.migrationSequenced.migratedAt) {
				this.migrationSequenced = true;
			}
		}
		assert(this.latestSequenceNumber >= this.minimumSequenceNumber, "Invalid sequence number");
	}

	public sequenceOp(
		clientId: string,
		referenceSequenceNumber: number,
		sequenceNumber: number,
		minimumSequenceNumber: number,
		isMigrationOp: boolean,
	): MigrationPhase {
		assert(
			minimumSequenceNumber >= this.minimumSequenceNumber,
			"Invalid minimum sequence number",
		);
		this.minimumSequenceNumber = minimumSequenceNumber;

		// Allows equal due to batching
		assert(sequenceNumber >= this.latestSequenceNumber, "Invalid sequence number");
		this.latestSequenceNumber = sequenceNumber;

		assert(
			referenceSequenceNumber >= this.minimumSequenceNumber,
			"Invalid reference sequence number",
		);

		try {
			if (this.migrationSequenced === true) {
				// All clients have observed the migration.
				assert(!isMigrationOp, "Migration op should not occur after migration is finished");
				return MigrationPhase.After;
			} else if (this.migrationSequenced === undefined) {
				if (isMigrationOp) {
					this.migrationSequenced = {
						migratedAt: sequenceNumber,
						allSequencedMigrations: new Set([clientId]),
					};
					return MigrationPhase.Migration;
				} else {
					// No migration has been sequenced.
					return MigrationPhase.Before;
				}
			} else {
				if (referenceSequenceNumber >= this.migrationSequenced.migratedAt) {
					// Client has observed the migration
					assert(!isMigrationOp, "Migration op should not occur after migration is observed");
					return MigrationPhase.After;
				}

				if (isMigrationOp) {
					assert(
						!this.migrationSequenced.allSequencedMigrations.has(clientId),
						"Duplicate migration from client",
					);
					this.migrationSequenced.allSequencedMigrations.add(clientId);
					return MigrationPhase.Migration;
				}

				// eslint-disable-next-line unicorn/prefer-ternary
				if (this.migrationSequenced.allSequencedMigrations.has(clientId)) {
					// This client did a local migration
					return MigrationPhase.After;
				} else {
					// This client did not do a local migration, nor observe the first one.
					return MigrationPhase.Before;
				}
			}
		} finally {
			if (
				typeof this.migrationSequenced === "object" &&
				minimumSequenceNumber >= this.migrationSequenced.migratedAt
			) {
				this.migrationSequenced = true;
			}
		}
	}

	public summarize(): PendingClients | undefined | true {
		if (this.migrationSequenced === undefined) {
			return undefined;
		} else if (this.migrationSequenced === true) {
			return true;
		} else {
			return {
				first: this.migrationSequenced.migratedAt,
				migrated: [...this.migrationSequenced.allSequencedMigrations],
			};
		}
	}
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
		telemetryContext: ITelemetryContext | undefined,
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined,
	): ISummaryTreeWithStats {
		// TODO: determine if incrementalSummaryContext should be hidden from kernel on first summary after migration.
		const result = this.data.kernel.summarizeCore(
			serializer,
			telemetryContext,
			incrementalSummaryContext,
		);

		const pending = this.data.migrationSequenced.summarize();
		if (pending !== undefined) {
			const m: MigrationSummary = {
				id: this.migrationOptions.migrationIdentifier,
				version: 1,
				migrationTag: "26f3e70a-2e99-4d09-8923-5538f05a051a",
				pendingClients: pending === true ? undefined : pending,
			};
			compiledMigrationSummary.Check(m);
			addBlobToSummary(result, this.migrationOptions.migrationIdentifier, JSON.stringify(m));
		}
		return result;
	}

	public async loadCore(storage: IChannelStorageService): Promise<void> {
		assert(this.#data === undefined, "loadCore should only be called once, and called first");

		const migrated = await storage.contains(this.migrationOptions.migrationIdentifier);

		let pendingClients: PendingClients | undefined | true;
		if (migrated) {
			const buffer = await storage.readBlob(this.migrationOptions.migrationIdentifier);
			const utf8 = bufferToString(buffer, "utf8");
			const parsed: unknown = JSON.parse(utf8);
			assert(compiledMigrationSummary.Check(parsed), "Invalid migration summary");
			pendingClients = parsed.pendingClients ?? true;
		}

		// This could cause an upgrade if no beforeAdapter is provided. TODO: is that ok? Handle readonly.
		this.#data = await this.initLoadCore(pendingClients, storage);
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

	/**
	 * Forward messages to the kernel.
	 */
	private delegatedMessagesCore(
		envelope: ISequencedMessageEnvelope,
		messages: readonly IRuntimeMessagesContent[],
		local: boolean,
	): void {
		this.data.kernel.processMessagesCore(
			this.delegatedMessagesCollection(envelope, messages, local),
		);
	}

	private delegatedMessagesCollection(
		envelope: ISequencedMessageEnvelope,
		messages: readonly IRuntimeMessagesContent[],
		local: boolean,
	): IRuntimeMessageCollection {
		return {
			envelope,
			local,
			messagesContent: messages.map((message) => ({
				clientSequenceNumber: message.clientSequenceNumber,
				contents: message.contents,
				localOpMetadata: (message.localOpMetadata as LocalOpMetadata | undefined)?.inner,
			})),
		};
	}

	public processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		const local = messagesCollection.local;
		const envelope = messagesCollection.envelope;

		// TODO: forward more cases without splitting the messagesCollection.
		// The messagesCollection should only be split when the migration happens or rebasing over the migration is needed.

		for (const message of messagesCollection.messagesContent) {
			const migration = opMigrationId(message);
			const isThisMigration = migration === this.migrationOptions.migrationIdentifier;

			assert(envelope.clientId !== null, "server should not send messages to SharedObject");

			const phase = this.data.migrationSequenced.sequenceOp(
				envelope.clientId,
				envelope.referenceSequenceNumber,
				envelope.referenceSequenceNumber,
				envelope.minimumSequenceNumber,
				isThisMigration,
			);

			assert(local === (message.localOpMetadata !== undefined), "Invalid local op metadata");
			if (local) {
				const metadata = message.localOpMetadata as LocalOpMetadata;
				assert(metadata.migrated === phase, "computed phase should match metadata");
			}

			switch (phase) {
				case MigrationPhase.Before: {
					assert(!isThisMigration, "Migration op should not be considered before migration");

					if (this.data.migrated === undefined) {
						this.delegatedMessagesCore(envelope, [message], local);
					} else {
						// A local migration is pending.

						// TODO: apply this to the before version as well

						this.data.migrated.applyOpDuringMigration(
							this.data,
							this.data.adapter,
							this.delegatedMessagesCollection(envelope, [message], local),
						);
					}
					break;
				}
				case MigrationPhase.Migration: {
					assert(isThisMigration, "Migration should be from migration op");
					if (this.data.migrated === undefined) {
						assert(
							!local,
							"If local migration is sequence, should have already locally migrated",
						);
						this.upgrade(false);
					}

					assert(
						this.data.migrated !== undefined,
						"Migration should have happened locally already",
					);

					// TODO: call this, passing before and after
					// this.data.migrated.migrated()

					// Concurrent migrations. Drop this one.
					// Will also drop local ops that client made before observing the first migration ensuring loading up new DDS doesn't happen twice.
					// Maybe telemetry here?
				}
				case MigrationPhase.After: {
					assert(
						this.data.migrated !== undefined,
						"Migration should have happened locally already if migration has been sequenced",
					);

					if (isThisMigration) {
						// Drop redundant migration op which was concurrent with migration, and ordered later.
						return;
					}

					this.delegatedMessagesCore(envelope, [message], local);

					break;
				}
				default: {
					unreachableCase(phase);
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
	 *
	 * TODO: comments like above should not be in terms of map and tree.
	 */
	private upgrade(doEdits: boolean): void {
		const data = this.data;
		if (data.migrated !== undefined) {
			// Already migrated
			return;
		}

		const after = this.init(true);

		if (doEdits) {
			this.sendUpgrade(data.view as TFrom, after, after.adapter);
		}

		this.#data = after;
	}

	/**
	 * Convert the underling data structure into a tree.
	 * @remarks
	 * This does not prevent the map APIs from being available:
	 * until `viewWith` is called, the map APIs are still available and will be implemented on-top of the tree structure.
	 */
	private sendUpgrade(from: TFrom, after: FactoryOut<object>, adaptedTo: TOut): void {
		const to = after.view;
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
			after.kernel.didAttach?.();
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
		pendingClients: PendingClients | undefined | true,
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
			migrationSequenced: new SequencedMigrationStatus(pendingClients),
		};
	}

	private async initLoadCore(
		pendingClients: PendingClients | undefined | true,
		storage: IChannelStorageService,
	): Promise<ShimData<TOut>> {
		if (pendingClients === undefined) {
			// Pre Migration
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
				return this.finishInit(after, this.migrationOptions, pendingClients, (view) => {
					const adapter = this.migrationOptions.afterAdapter(view);
					this.sendUpgrade(before.view, after, adapter);
					return adapter;
				});
			} else {
				// Create pre migration
				return this.finishInit(
					before,
					undefined,
					pendingClients,
					this.migrationOptions.beforeAdapter.bind(this.migrationOptions),
				);
			}
		} else {
			// Create post migration
			const after = await this.migrationOptions.to.loadCore(
				this.adjustedKernelArgs(true),
				storage,
			);
			return this.finishInit(after, this.migrationOptions, pendingClients, (view) =>
				this.migrationOptions.afterAdapter(view),
			);
		}
	}

	private init(locallyMigrated: boolean): ShimData<TOut> {
		if (locallyMigrated) {
			// Create post migration
			const after = this.migrationOptions.to.create(this.adjustedKernelArgs(true));
			return this.finishInit(after, this.migrationOptions, undefined, (view) =>
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
				return this.finishInit(after, this.migrationOptions, undefined, (view) => {
					const adapter = this.migrationOptions.afterAdapter(view);
					this.sendUpgrade(before.view, after, adapter);
					return adapter;
				});
			} else {
				// Create pre migration
				return this.finishInit(
					before,
					undefined,
					undefined,
					this.migrationOptions.beforeAdapter.bind(this.migrationOptions),
				);
			}
		}
	}

	private get data(): ShimData<TOut> {
		if (this.#data === undefined) {
			// TODO: can we create post migration somehow? Maybe create logic/factory should create the final shared object directly and skip the shim?
			this.#data = this.init(false);
		}
		return this.#data;
	}

	public didAttach(): void {
		this.data.kernel.didAttach?.();
	}
}
