/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
// eslint-disable-next-line import/no-deprecated
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { DiceRollerInstantiationFactory, IDiceRoller } from "./diceRoller";

const diceRollerId = "dice-roller";

/**
 * The data model for our application.
 *
 * @remarks Note that this version of the model only has a dice roller object.
 */
export interface IDiceRollerAppModel {
	/**
	 * DiceRoller data object to track the current dice roll.
	 */
	readonly diceRoller: IDiceRoller;
}

class DiceRollerAppModel implements IDiceRollerAppModel {
	public constructor(
		public readonly diceRoller: IDiceRoller,
		public readonly container: IContainer,
	) {
		container.on("closed", () => {
			// Ensure the user can't roll the dice after the container is closed.
			diceRoller.close();
		});
	}
}

/**
 * The runtime factory for our Fluid container.
 */
export class DiceRollerContainerRuntimeFactory extends ModelContainerRuntimeFactory<IDiceRollerAppModel> {
	constructor() {
		super(
			new Map([DiceRollerInstantiationFactory.registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const diceRoller = await runtime.createDataStore(DiceRollerInstantiationFactory.type);
		await diceRoller.trySetAlias(diceRollerId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		// eslint-disable-next-line import/no-deprecated
		const diceRoller = await requestFluidObject<IDiceRoller>(
			await runtime.getRootDataStore(diceRollerId),
			"",
		);
		return new DiceRollerAppModel(diceRoller, container);
	}
}
