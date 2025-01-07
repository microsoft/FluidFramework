/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getDataStoreEntryPoint } from "@fluid-example/example-utils";
import { IProvideRuntimeAttributor, IRuntimeAttributor } from "@fluid-experimental/attributor";
import { IContainer } from "@fluidframework/container-definitions/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import { FluidObject } from "@fluidframework/core-interfaces";

import { HitCounter } from "./dataObject.js";
import { ModelContainerRuntimeFactoryWithAttribution } from "./modelContainerRuntimeFactoryWithAttribution.js";

export interface IHitCounterAppModel {
	readonly hitCounter: HitCounter;
	readonly runtimeAttributor?: IRuntimeAttributor | undefined;
}

class HitCounterAppModel implements IHitCounterAppModel {
	public constructor(
		public readonly hitCounter: HitCounter,
		public readonly runtimeAttributor?: IRuntimeAttributor,
	) {}
}

const hitCounterId = "hit-counter";

export class HitCounterContainerRuntimeFactory extends ModelContainerRuntimeFactoryWithAttribution<IHitCounterAppModel> {
	constructor() {
		super(
			new Map([HitCounter.getFactory().registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const hitCounter = await runtime.createDataStore(HitCounter.getFactory().type);
		await hitCounter.trySetAlias(hitCounterId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(
		runtime: IContainerRuntime,
		container: IContainer,
	): Promise<HitCounterAppModel> {
		const hitCounter = await getDataStoreEntryPoint<HitCounter>(runtime, hitCounterId);
		const maybeProvidesAttributor: FluidObject<IProvideRuntimeAttributor> = runtime.scope;
		const runtimeAttributor = maybeProvidesAttributor.IRuntimeAttributor;
		return new HitCounterAppModel(hitCounter, runtimeAttributor);
	}
}
