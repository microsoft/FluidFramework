/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPactMap, PactMap } from "@fluid-experimental/pact-map";
import { ITaskManager, TaskManager } from "@fluidframework/task-manager";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	ConsensusRegisterCollection,
	IConsensusRegisterCollection,
} from "@fluidframework/register-collection";

import type { IMigrationTool } from "../migrationInterfaces";

const pactMapKey = "pact-map";
const crcKey = "crc";
const taskManagerKey = "task-manager";
const newVersionKey = "newVersion";
const migrateTaskName = "migrate";
const newContainerIdKey = "newContainerId";

export class MigrationTool extends DataObject implements IMigrationTool {
	private _pactMap: IPactMap<string> | undefined;
	private _crc: IConsensusRegisterCollection<string> | undefined;
	private _taskManager: ITaskManager | undefined;

	private get pactMap() {
		if (this._pactMap === undefined) {
			throw new Error("Couldn't retrieve the PactMap");
		}
		return this._pactMap;
	}

	private get crc() {
		if (this._crc === undefined) {
			throw new Error("Couldn't retrieve the ConsensusRegisterCollection");
		}
		return this._crc;
	}

	private get taskManager() {
		if (this._taskManager === undefined) {
			throw new Error("Couldn't retrieve the TaskManager");
		}
		return this._taskManager;
	}

	public get migrationState() {
		if (this.newContainerId !== undefined) {
			return "migrated";
		} else if (this.acceptedVersion !== undefined) {
			return "migrating";
		} else if (this.proposedVersion !== undefined) {
			return "stopping";
		} else {
			return "collaborating";
		}
	}

	public get newContainerId() {
		return this.crc.read(newContainerIdKey);
	}

	public async finalizeMigration(id: string) {
		// Only permit a single container to be set as a migration destination.
		if (this.crc.read(newContainerIdKey) !== undefined) {
			throw new Error("New container was already established");
		}

		// Using a consensus data structure is important here, because other clients might race us to set the new
		// value.  All clients must agree on the final value even in these race conditions so everyone ends up in the
		// same final container.
		await this.crc.write(newContainerIdKey, id);
	}

	public get proposedVersion() {
		return this.pactMap.getPending(newVersionKey) ?? this.pactMap.get(newVersionKey);
	}

	public get acceptedVersion() {
		return this.pactMap.get(newVersionKey);
	}

	public readonly proposeVersion = (newVersion: string) => {
		// Don't permit changes to the version after a new one has already been accepted.
		// TODO: Consider whether we should throw on trying to set when a pending proposal exists -- currently
		// the PactMap will silently drop these on the floor.
		if (this.acceptedVersion !== undefined) {
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

	protected async initializingFirstTime() {
		const pactMap = PactMap.create(this.runtime);
		const crc = ConsensusRegisterCollection.create(this.runtime);
		const taskManager = TaskManager.create(this.runtime);
		this.root.set(pactMapKey, pactMap.handle);
		this.root.set(crcKey, crc.handle);
		this.root.set(taskManagerKey, taskManager.handle);
	}

	protected async hasInitialized() {
		const pactMapHandle = this.root.get<IFluidHandle<IPactMap<string>>>(pactMapKey);
		this._pactMap = await pactMapHandle?.get();

		const crcHandle = this.root.get<IFluidHandle<IConsensusRegisterCollection<string>>>(crcKey);
		this._crc = await crcHandle?.get();

		this.pactMap.on("pending", (key: string) => {
			if (key === newVersionKey) {
				this.emit("stopping");
			}
		});

		this.pactMap.on("accepted", (key: string) => {
			if (key === newVersionKey) {
				this.emit("migrating");
			}
		});

		this.crc.on("atomicChanged", (key: string) => {
			if (key === newContainerIdKey) {
				this.emit("migrated");
			}
		});

		const taskManagerHandle = this.root.get<IFluidHandle<ITaskManager>>(taskManagerKey);
		this._taskManager = await taskManagerHandle?.get();
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const MigrationToolInstantiationFactory = new DataObjectFactory<MigrationTool>(
	"migration-tool",
	MigrationTool,
	[ConsensusRegisterCollection.getFactory(), PactMap.getFactory(), TaskManager.getFactory()],
	{},
);
