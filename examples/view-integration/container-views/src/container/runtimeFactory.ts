/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import type { FluidObject } from "@fluidframework/core-interfaces";
import { createElement } from "react";
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot, type Root } from "react-dom/client";

import { DiceRollerFactory, type IDiceRoller } from "./diceRoller/index.js";
import { DiceRollerView } from "./view.js";

/**
 * An entry point that knows how to mount and unmount itself into a DOM element.
 * This is the key concept of the container-views pattern: the container provides its own view.
 */
export interface IContainerView {
	mount(element: HTMLElement): void;
	unmount(): void;
}

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
			entryPointRuntime: IContainerRuntime,
		): Promise<FluidObject> => {
			const diceRollerHandle =
				await entryPointRuntime.getAliasedDataStoreEntryPoint(diceRollerId);
			if (diceRollerHandle === undefined) {
				throw new Error("Dice roller missing!");
			}
			const diceRoller = (await diceRollerHandle.get()) as IDiceRoller;

			// The container bundles the view with the model -- this is the container-views pattern.
			let root: Root | undefined;
			const containerView: IContainerView = {
				mount(element: HTMLElement): void {
					root = createRoot(element);
					root.render(createElement(DiceRollerView, { diceRoller }));
				},
				unmount(): void {
					root?.unmount();
					root = undefined;
				},
			};
			return containerView;
		};

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

		return runtime;
	}
}
