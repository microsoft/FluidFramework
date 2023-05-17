/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";

import { DiceRollerFactory, IDiceRoller } from "./dataObject";

/**
 * The data model for our application.
 *
 * @remarks Since this is a simple example it's just a single data object.  More advanced scenarios may have more
 * complex models.
 */
export interface IDiceRollerAppModel {
	readonly diceRoller: IDiceRoller;
}

class DiceRollerAppModel implements IDiceRollerAppModel {
	public constructor(public readonly diceRoller: IDiceRoller) {}
}

const diceRollerRegistryKey = "dice-roller";
const diceRollerFactory = new DiceRollerFactory();
const diceRollerId = "dice-roller";

/**
 * The runtime factory for our Fluid container.
 */
export class DiceRollerContainerRuntimeFactory extends ModelContainerRuntimeFactory<IDiceRollerAppModel> {
	constructor() {
		super(
			new Map([[diceRollerRegistryKey, Promise.resolve(diceRollerFactory)]]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const diceRoller = await runtime.createDataStore(diceRollerRegistryKey);
		await diceRoller.trySetAlias(diceRollerId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		// If runtime.getRootDataStoreChannel was public we could just call that.
		const diceRollerRuntime = (await runtime.getRootDataStore(
			diceRollerId,
		)) as IFluidDataStoreChannel;
		const diceRollerEntryPoint = diceRollerRuntime.entryPoint;
		if (diceRollerEntryPoint === undefined) {
			throw new Error("EntryPoint was not defined");
		}
		const diceRoller = (await diceRollerEntryPoint.get()) as IDiceRoller;
		return new DiceRollerAppModel(diceRoller);
	}
}
