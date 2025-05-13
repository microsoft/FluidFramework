/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IFluidDataStoreFactory,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";
import { PerformanceEvent, createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { RuntimeAttributorDataStoreChannel } from "./runtimeAttributorDataStoreChannel.js";

/**
 * Factory for the runtime attributor data store channel.
 */
export class RuntimeAttributorFactory implements IFluidDataStoreFactory {
	public static readonly type = "@fluid-experimental/attributor";

	public get type(): string {
		return RuntimeAttributorFactory.type;
	}

	public get IFluidDataStoreFactory(): IFluidDataStoreFactory {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const runtime = new RuntimeAttributorDataStoreChannel(context, existing);

		const logger = createChildLogger({
			logger: context.baseLogger,
			namespace: "Attributor",
		});

		await PerformanceEvent.timedExecAsync(
			logger,
			{
				eventName: "initialize",
			},
			async (event) => {
				await runtime.initialize(
					context.deltaManager,
					context.getQuorum(),
					context.baseSnapshot,
					async (id: string) => context.storage.readBlob(id),
				);
				event.end({
					attributionEnabledInDoc: true, // If we are instantiating the attributor, it is enabled
				});
			},
		);
		return runtime;
	}
}
