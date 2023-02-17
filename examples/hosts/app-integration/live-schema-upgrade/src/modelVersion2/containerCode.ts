/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { DiceRollerInstantiationFactory, IDiceRoller } from "./diceRoller";
import { DiceCounterInstantiationFactory, IDiceCounter } from "./diceCounter";

/**
 * The data model for our application.
 *
 * @remarks Since this is a simple example it's just a single data object.  More advanced scenarios may have more
 * complex models.
 */
export interface IDiceRollerAppModel {
	readonly diceRoller: IDiceRoller;
	readonly diceCounter: IDiceCounter;
}

class DiceRollerAppModel implements IDiceRollerAppModel {
	// public readonly version = "2.0";

	public constructor(
		public readonly diceRoller: IDiceRoller,
		public readonly diceCounter: IDiceCounter,
	) {}
}

const diceRollerId = "dice-roller";
const diceCounterId = "dice-counter";

/**
 * The runtime factory for our Fluid container.
 */
export class DiceRollerContainerRuntimeFactory extends ModelContainerRuntimeFactory<IDiceRollerAppModel> {
	constructor() {
		super(
			new Map([
				DiceRollerInstantiationFactory.registryEntry,
				DiceCounterInstantiationFactory.registryEntry,
			]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const diceRoller = await runtime.createDataStore(DiceRollerInstantiationFactory.type);
		await diceRoller.trySetAlias(diceRollerId);
		const diceCounter = await runtime.createDataStore(DiceCounterInstantiationFactory.type);
		await diceCounter.trySetAlias(diceCounterId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const currentDetails = container.getSpecifiedCodeDetails();
		console.log("currentDetails:", currentDetails);
		if (currentDetails?.package !== "2.0") {
			console.log("upgrading to 2.0");
			if (container.connectionState !== ConnectionState.Connected) {
				await new Promise((resolve) => {
					container.once("connected", resolve);
				});
			}
			const proposal: IFluidCodeDetails = { package: "2.0" };
			container
				.proposeCodeDetails(proposal)
				.then((success) => {
					console.log("proposeCodeDetails() success:", success);
					if (success) {
						console.log("currentDetails:", container.getSpecifiedCodeDetails());
					}
				})
				.catch((error) => {
					console.log("proposeCodeDetails() error:", error);
				});
		}

		const diceRoller = await requestFluidObject<IDiceRoller>(
			await runtime.getRootDataStore(diceRollerId),
			"",
		);
		let diceCounter: IDiceCounter;
		try {
			diceCounter = await requestFluidObject<IDiceCounter>(
				await runtime.getRootDataStore(diceCounterId, false),
				"",
			);
		} catch {
			const diceCounterDataStore = await runtime.createDataStore(
				DiceCounterInstantiationFactory.type,
			);
			await diceCounterDataStore.trySetAlias(diceCounterId);
			diceCounter = await requestFluidObject<IDiceCounter>(
				await runtime.getRootDataStore(diceCounterId),
				"",
			);
		}

		return new DiceRollerAppModel(diceRoller, diceCounter);
	}
}
