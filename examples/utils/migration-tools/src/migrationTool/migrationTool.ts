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
import { ITaskManager, TaskManager } from "@fluidframework/task-manager/internal";

import type {
	IAcceptedMigrationDetails,
	IMigrationTool,
	IMigrationToolEvents,
	MigrationState,
} from "./interfaces.js";

const consensusRegisterCollectionId = "consensus-register-collection";
const pactMapId = "pact-map";
const taskManagerId = "task-manager";

const newVersionKey = "newVersion";
const migrateTaskName = "migrate";
const newContainerIdKey = "newContainerId";

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
		if (this.newContainerId !== undefined) {
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

	public get newContainerId(): string | undefined {
		return this.consensusRegisterCollection.read(newContainerIdKey);
	}

	public constructor(
		// TODO:  Does this need a full runtime?  Can we instead specify exactly what the data object requires?
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly consensusRegisterCollection: IConsensusRegisterCollection<string>,
		private readonly pactMap: IPactMap<string>,
		private readonly taskManager: ITaskManager,
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
					this._events.emit("stopping");
				}
			});

			this.pactMap.on("accepted", (key: string) => {
				if (key === newVersionKey) {
					this._events.emit("migrating");
				}
			});

			this.consensusRegisterCollection.on("atomicChanged", (key: string) => {
				if (key === newContainerIdKey) {
					this._events.emit("migrated");
				}
			});
		}
	}

	public async finalizeMigration(id: string): Promise<void> {
		// Only permit a single container to be set as a migration destination.
		if (this.consensusRegisterCollection.read(newContainerIdKey) !== undefined) {
			throw new Error("New container was already established");
		}

		// Using a consensus data structure is important here, because other clients might race us to set the new
		// value.  All clients must agree on the final value even in these race conditions so everyone ends up in the
		// same final container.
		await this.consensusRegisterCollection.write(newContainerIdKey, id);
	}

	public get proposedVersion(): string | undefined {
		return this.pactMap.getPending(newVersionKey) ?? this.pactMap.get(newVersionKey);
	}

	public get acceptedMigration(): IAcceptedMigrationDetails | undefined {
		const migrationDetails = this.pactMap.getWithDetails(newVersionKey);
		if (migrationDetails === undefined) {
			return undefined;
		}
		if (migrationDetails.value === undefined) {
			throw new Error(
				"Expect migration version to be specified if migration has been accepted",
			);
		}
		return {
			newVersion: migrationDetails.value,
			migrationSequenceNumber: migrationDetails.acceptedSequenceNumber,
		};
	}

	public readonly proposeVersion = (newVersion: string): void => {
		// Don't permit changes to the version after a new one has already been accepted.
		// TODO: Consider whether we should throw on trying to set when a pending proposal exists -- currently
		// the PactMap will silently drop these on the floor.
		if (this.acceptedMigration !== undefined) {
			throw new Error("New version was already accepted");
		}

		// Note that the accepted proposal could come from another client (e.g. two clients try to propose
		// simultaneously).
		this.pactMap.set(newVersionKey, newVersion);
	};

	public async volunteerForMigration(): Promise<boolean> {
		return this.taskManager.volunteerForTask(migrateTaskName);
	}

	public haveMigrationTask(): boolean {
		return this.taskManager.assigned(migrateTaskName);
	}

	public completeMigrationTask(): void {
		this.taskManager.complete(migrateTaskName);
	}

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
const taskManagerFactory = TaskManager.getFactory();

const migrationToolSharedObjectRegistry = new Map<string, IChannelFactory>([
	[consensusRegisterCollectionFactory.type, consensusRegisterCollectionFactory],
	[pactMapFactory.type, pactMapFactory],
	[taskManagerFactory.type, taskManagerFactory],
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
			// We have to provide a callback here to get an entryPoint, otherwise we would just omit it if we could always get an entryPoint.
			async () => instance,
		);

		let consensusRegisterCollection: IConsensusRegisterCollection<string>;
		let pactMap: IPactMap<string>;
		let taskManager: ITaskManager;
		if (existing) {
			consensusRegisterCollection = (await runtime.getChannel(
				consensusRegisterCollectionId,
			)) as IConsensusRegisterCollection<string>;
			pactMap = (await runtime.getChannel(pactMapId)) as IPactMap<string>;
			taskManager = (await runtime.getChannel(taskManagerId)) as ITaskManager;
		} else {
			consensusRegisterCollection = runtime.createChannel(
				consensusRegisterCollectionId,
				consensusRegisterCollectionFactory.type,
			) as IConsensusRegisterCollection<string>;
			consensusRegisterCollection.bindToContext();
			pactMap = runtime.createChannel(pactMapId, pactMapFactory.type) as IPactMap<string>;
			pactMap.bindToContext();
			taskManager = runtime.createChannel(
				taskManagerId,
				taskManagerFactory.type,
			) as ITaskManager;
			taskManager.bindToContext();
		}

		// By this point, we've performed any async work required to get the dependencies of the MigrationTool,
		// so just a normal sync constructor will work fine (no followup async initialize()).
		const instance = new MigrationTool(
			runtime,
			consensusRegisterCollection,
			pactMap,
			taskManager,
		);

		return runtime;
	}
}
