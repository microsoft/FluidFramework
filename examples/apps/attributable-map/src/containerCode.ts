/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { FluidObject } from "@fluidframework/core-interfaces";
import { IRuntimeAttributor, IProvideAttributorConfig } from "@fluid-experimental/attributor";
import { ModelContainerRuntimeFactoryWithAttribution } from "./modelContainerRuntimeFactoryWithAttribution";
import { HitCounter } from "./dataObject";

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
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const hitCounter = await runtime.createDataStore(HitCounter.getFactory().type);
		await hitCounter.trySetAlias(hitCounterId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const hitCounter = await requestFluidObject<HitCounter>(
			await runtime.getRootDataStore(hitCounterId),
			"",
		);
		const maybeProvidesAttributor: FluidObject<IProvideAttributorConfig> = runtime.scope;
		const runtimeAttributor = maybeProvidesAttributor.IAttributorConfig?.runtimeAttributor;
		return new HitCounterAppModel(hitCounter, runtimeAttributor);
	}
}
