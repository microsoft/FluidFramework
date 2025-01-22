/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getDataStoreEntryPoint } from "@fluid-example/example-utils";
import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import type { FluidObject } from "@fluidframework/core-interfaces";

import { DiceRollerFactory } from "./dataObject.js";

const diceRollerId = "dice-roller";
const diceRollerRegistryKey = "dice-roller";
const diceRollerFactory = new DiceRollerFactory();

export class DiceRollerContainerRuntimeFactory implements IRuntimeFactory {
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const provideEntryPoint = async (
			containerRuntime: IContainerRuntime,
		): Promise<FluidObject> => getDataStoreEntryPoint(containerRuntime, diceRollerId);

		const runtime = await loadContainerRuntime({
			context,
			registryEntries: new Map([[diceRollerRegistryKey, Promise.resolve(diceRollerFactory)]]),
			provideEntryPoint,
			existing,
		});

		if (!existing) {
			const diceRoller = await runtime.createDataStore(diceRollerRegistryKey);
			await diceRoller.trySetAlias(diceRollerId);
		}
		// Any onLoad work would happen here, none needed so far though.

		return runtime;
	}
}
