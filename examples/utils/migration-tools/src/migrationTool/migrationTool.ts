/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPactMap, PactMap } from "@fluid-experimental/pact-map";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	FluidObject,
	IEventProvider,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import {
	ConsensusRegisterCollection,
	IConsensusRegisterCollection,
} from "@fluidframework/register-collection/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";

import type {
	IAcceptedMigrationDetails,
	IMigrationTool,
	IMigrationToolEvents,
	MigrationState,
} from "./interfaces.js";

const consensusRegisterCollectionId = "consensus-register-collection";
const pactMapId = "pact-map";

const newVersionKey = "newVersion";
const migrationResultKey = "migrationResult";

class MigrationTool implements IMigrationTool {
	private _disposed = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	private readonly _events = new TypedEventEmitter<IMigrationToolEvents>();
	public get events(): IEventProvider<IMigrationToolEvents> {
		return this._events;
	}

	public get connected(): boolean {
		return this.runtime.connected;
	}

	public get handle(): IFluidHandle<FluidObject> {
		// MigrationToolFactory already provides an entryPoint initialization function to the data store runtime,
		// so this object should always have access to a non-null entryPoint.
		assert(this.runtime.entryPoint !== undefined, "EntryPoint was undefined");
		return this.runtime.entryPoint;
	}

	public get migrationState(): MigrationState {
		if (this.migrationResult !== undefined) {
			return "migrated";
		} else if (this.acceptedMigration !== undefined) {
			return "migrating";
			// eslint-disable-next-line unicorn/no-negated-condition
		} else if (this.proposedVersion !== undefined) {
			return "stopping";
		} else {
			return "collaborating";
		}
	}

	public get migrationResult(): unknown | undefined {
		return this.consensusRegisterCollection.read(migrationResultKey);
	}

	public constructor(
		// TODO:  Consider just specifying what the data object requires rather than taking a full runtime.
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly consensusRegisterCollection: IConsensusRegisterCollection<unknown>,
		private readonly pactMap: IPactMap<string>,
	) {
		if (this.runtime.disposed) {
			this.dispose();
		} else {
			this.runtime.once("dispose", this.dispose);
			this.runtime.on("connected", () => {
				this._events.emit("connected");
			});
			this.runtime.on("disconnected", () => {
				this._events.emit("disconnected");
			});
			this.pactMap.on("pending", (key: string) => {
				if (key === newVersionKey) {
					// TODO: Consider doing something dramatic here to park the container.  If the host gets the
					// Migrator it's not really necessary (they have all the info they need to show readonly UI,
					// stop sending changes, etc.) but this would add some extra protection in case some host isn't
					// watching their Migrator.
					this._events.emit("stopping");
				}
			});

			this.pactMap.on("accepted", (key: string) => {
				if (key === newVersionKey) {
					this._events.emit("migrating");
				}
			});

			this.consensusRegisterCollection.on("atomicChanged", (key: string) => {
				if (key === migrationResultKey) {
					this._events.emit("migrated");
				}
			});
		}
	}

	public async finalizeMigration(migrationResult: unknown): Promise<void> {
		// Only permit a single container to be set as a migration destination.
		assert(this.migrationResult === undefined, "Migration was already finalized");

		// Using a consensus data structure is important here, because other clients might race us to set the new
		// value.  All clients must agree on the final value even in these race conditions so everyone ends up in the
		// same final container.
		await this.consensusRegisterCollection.write(migrationResultKey, migrationResult);
	}

	public get proposedVersion(): string | undefined {
		return this.pactMap.getPending(newVersionKey) ?? this.pactMap.get(newVersionKey);
	}

	public get acceptedMigration(): IAcceptedMigrationDetails | undefined {
		const migrationDetails = this.pactMap.getWithDetails(newVersionKey);
		if (migrationDetails === undefined) {
			return undefined;
		}
		assert(
			migrationDetails.value !== undefined,
			"Expect migration version to be specified if migration has been accepted",
		);
		return {
			newVersion: migrationDetails.value,
			migrationSequenceNumber: migrationDetails.acceptedSequenceNumber,
		};
	}

	public readonly proposeVersion = (newVersion: string): void => {
		// Don't permit changes to the version after a new one has already been proposed.
		assert(this.proposedVersion === undefined, "A proposal was already made");

		// Note that the accepted proposal could come from another client (e.g. two clients try to propose
		// simultaneously).
		this.pactMap.set(newVersionKey, newVersion);
	};

	/**
	 * Called when the host container closes and disposes itself
	 */
	private readonly dispose = (): void => {
		this._disposed = true;
		// TODO: Unregister listeners
		this._events.emit("disposed");
	};
}

const consensusRegisterCollectionFactory = ConsensusRegisterCollection.getFactory();
const pactMapFactory = PactMap.getFactory();

const migrationToolSharedObjectRegistry = new Map<string, IChannelFactory>([
	[consensusRegisterCollectionFactory.type, consensusRegisterCollectionFactory],
	[pactMapFactory.type, pactMapFactory],
]);

/**
 * @alpha
 */
export class MigrationToolFactory implements IFluidDataStoreFactory {
	public get type(): string {
		throw new Error("Do not use the type on the data store factory");
	}

	public get IFluidDataStoreFactory(): IFluidDataStoreFactory {
		return this;
	}

	// Effectively, this pattern puts the factory in charge of "unpacking" the context, getting everything ready to assemble the MigrationTool
	// As opposed to the MigrationTool instance having an initialize() method to be called after the fact that does the unpacking.
	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			migrationToolSharedObjectRegistry,
			existing,
			async () => instance,
		);

		let consensusRegisterCollection: IConsensusRegisterCollection<string>;
		let pactMap: IPactMap<string>;
		if (existing) {
			consensusRegisterCollection = (await runtime.getChannel(
				consensusRegisterCollectionId,
			)) as IConsensusRegisterCollection<string>;
			pactMap = (await runtime.getChannel(pactMapId)) as IPactMap<string>;
		} else {
			consensusRegisterCollection = runtime.createChannel(
				consensusRegisterCollectionId,
				consensusRegisterCollectionFactory.type,
			) as IConsensusRegisterCollection<string>;
			consensusRegisterCollection.bindToContext();
			pactMap = runtime.createChannel(pactMapId, pactMapFactory.type) as IPactMap<string>;
			pactMap.bindToContext();
		}

		// By this point, we've performed any async work required to get the dependencies of the MigrationTool,
		// so just a normal sync constructor will work fine (no followup async initialize()).
		const instance = new MigrationTool(runtime, consensusRegisterCollection, pactMap);

		return runtime;
	}
}
