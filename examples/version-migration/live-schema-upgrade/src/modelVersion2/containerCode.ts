/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/legacy";
import { ConnectionState } from "@fluidframework/container-loader";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";

import { DiceCounterInstantiationFactory, IDiceCounter } from "./diceCounter.js";
import { DiceRollerInstantiationFactory, IDiceRoller } from "./diceRoller.js";

const diceRollerId = "dice-roller";
const diceCounterId = "dice-counter";

/**
 * The data model for our application.
 *
 * @remarks Note that this version of the model has a dice counter object in addition to the dice roller object.
 */
export interface IDiceRollerAppModel {
	/**
	 * DiceRoller data object to track the current dice roll.
	 */
	readonly diceRoller: IDiceRoller;

	/**
	 * DiceCounter data object to track the number of times the dice have been rolled.
	 */
	readonly diceCounter: IDiceCounter;

	/**
	 * Returns the current version of the container.
	 */
	readonly getCurrentVersion: () => string;

	/**
	 * Perform the code proposal to upgrade the container to the latest version.
	 */
	readonly upgrade: (targetVersion: string) => Promise<void>;
}

class DiceRollerAppModel implements IDiceRollerAppModel {
	public constructor(
		public readonly diceRoller: IDiceRoller,
		public readonly diceCounter: IDiceCounter,
		public readonly container: IContainer,
	) {
		container.on("closed", () => {
			// Ensure the user can't roll the dice after the container is closed.
			diceRoller.close();
		});
	}

	public getCurrentVersion() {
		return this.container.getSpecifiedCodeDetails()?.package as string;
	}

	public async upgrade(targetVersion: string) {
		const currentVersion = this.getCurrentVersion();
		if (currentVersion === targetVersion) {
			// We shouldn't try to upgrade if we are already on the latest version.
			return;
		}
		console.log(`Upgrading to ${targetVersion}`);
		if (this.container.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => {
				this.container.once("connected", resolve);
			});
		}
		const proposal: IFluidCodeDetails = { package: targetVersion };
		this.container
			.proposeCodeDetails(proposal)
			.then(async (accepted: boolean) => {
				console.log(`Upgrade accepted: ${accepted}`);
				if (!accepted && this.container.connectionState !== ConnectionState.Connected) {
					// If the upgrade was rejected and we are disconnected, we should try again once we reconnect.
					await new Promise((resolve) => {
						this.container.once("connected", resolve);
					});
					await this.upgrade(targetVersion);
				}
			})
			.catch((error) => {
				console.error("Failed to upgrade:", error);
			});
	}
}

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
		const diceRoller = await getDataStoreEntryPoint<IDiceRoller>(runtime, diceRollerId);

		// Note: Since at this point is unclear whether or not this is the first time the app is being loaded with the
		// new model, we should try to get the DiceCounter object and if it doesn't exist, create it.
		let diceCounter: IDiceCounter;
		try {
			diceCounter = await getDataStoreEntryPoint<IDiceCounter>(runtime, diceCounterId);
		} catch {
			const diceCounterDataStore = await runtime.createDataStore(
				DiceCounterInstantiationFactory.type,
			);
			await diceCounterDataStore.trySetAlias(diceCounterId);
			diceCounter = await getDataStoreEntryPoint<IDiceCounter>(runtime, diceCounterId);
		}

		return new DiceRollerAppModel(diceRoller, diceCounter, container);
	}
}
