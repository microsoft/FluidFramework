/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";

import { IDiceRoller } from "./interface.js";
import { OldestClientDiceRollerInstantiationFactory } from "./oldestClientDiceRoller.js";
import { TaskManagerDiceRollerInstantiationFactory } from "./taskManagerDiceRoller.js";

/**
 * The data model for our application.
 *
 * @remarks Since this is a simple example it's just a single data object.  More advanced scenarios may have more
 * complex models.
 */
export interface ITaskSelectionAppModel {
	readonly taskManagerDiceRoller: IDiceRoller;
	readonly oldestClientDiceRoller: IDiceRoller;
}

class TaskSelectionAppModel implements ITaskSelectionAppModel {
	public constructor(
		public readonly taskManagerDiceRoller: IDiceRoller,
		public readonly oldestClientDiceRoller: IDiceRoller,
	) {}
}

const taskManagerDiceId = "taskManagerDice";
const oldestClientDiceId = "oldestClientDice";

/**
 * The runtime factory for our Fluid container.
 */
export class TaskSelectionContainerRuntimeFactory extends ModelContainerRuntimeFactory<ITaskSelectionAppModel> {
	constructor() {
		super(
			new Map([
				TaskManagerDiceRollerInstantiationFactory.registryEntry,
				OldestClientDiceRollerInstantiationFactory.registryEntry,
			]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const taskManagerDiceRoller = await runtime.createDataStore(
			TaskManagerDiceRollerInstantiationFactory.type,
		);
		await taskManagerDiceRoller.trySetAlias(taskManagerDiceId);
		const oldestClientDiceRoller = await runtime.createDataStore(
			OldestClientDiceRollerInstantiationFactory.type,
		);
		await oldestClientDiceRoller.trySetAlias(oldestClientDiceId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		return new TaskSelectionAppModel(
			await getDataStoreEntryPoint<IDiceRoller>(runtime, taskManagerDiceId),
			await getDataStoreEntryPoint<IDiceRoller>(runtime, oldestClientDiceId),
		);
	}
}
