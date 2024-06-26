/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";

/**
 * @legacy
 * @alpha
 */
export abstract class RuntimeFactoryHelper<T = IContainerRuntime> implements IRuntimeFactory {
	public get IRuntimeFactory() {
		return this;
	}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const runtime = await this.preInitialize(context, existing);
		await (existing
			? this.instantiateFromExisting(runtime)
			: this.instantiateFirstTime(runtime));
		await this.hasInitialized(runtime);
		return runtime;
	}

	public abstract preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime & T>;
	public async instantiateFirstTime(_runtime: T): Promise<void> {}
	public async instantiateFromExisting(_runtime: T): Promise<void> {}
	public async hasInitialized(_runtime: T): Promise<void> {}
}
