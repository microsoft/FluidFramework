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
	public get IRuntimeFactory(): this {
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

	/**
	 * Called at the start of initializing a container, to create the container runtime instance.
	 * @param context - The context for the container being initialized
	 * @param existing - Whether the container already exists and is being loaded (else it's being created new just now)
	 */
	public abstract preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime & T>;
	/**
	 * Called the one time the container is created, and not on any subsequent load.
	 * i.e. only when it's initialized on the client that first created it
	 * @param runtime - The runtime for the container being initialized
	 */
	public async instantiateFirstTime(_runtime: T): Promise<void> {}
	/**
	 * Called every time the container runtime is loaded for an existing container.
	 * i.e. every time it's initialized _except_ for when it is first created
	 * @param runtime - The runtime for the container being initialized
	 */
	public async instantiateFromExisting(_runtime: T): Promise<void> {}
	/**
	 * Called at the end of initializing a container, after the runtime has been created or loaded.
	 * @param runtime - The runtime for the container being initialized
	 */
	public async hasInitialized(_runtime: T): Promise<void> {}
}
