/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
// eslint-disable-next-line import/no-deprecated
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { IDiceRoller } from "./interface";
import { OldestClientDiceRollerInstantiationFactory } from "./oldestClientDiceRoller";
import { TaskManagerDiceRollerInstantiationFactory } from "./taskManagerDiceRoller";

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
		// eslint-disable-next-line import/no-deprecated
		const taskManagerDiceRoller = await requestFluidObject<IDiceRoller>(
			await runtime.getRootDataStore(taskManagerDiceId),
			"",
		);
		// eslint-disable-next-line import/no-deprecated
		const oldestClientDiceRoller = await requestFluidObject<IDiceRoller>(
			await runtime.getRootDataStore(oldestClientDiceId),
			"",
		);
		return new TaskSelectionAppModel(taskManagerDiceRoller, oldestClientDiceRoller);
	}
}
