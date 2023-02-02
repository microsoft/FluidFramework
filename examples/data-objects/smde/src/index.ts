/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { buildRuntimeRequestHandler } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject, RequestParser, RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";

// import React from "react";

import { Smde, SmdeFactory, SmdeHTMLView } from "./smde";

const defaultComponentId = "default";

const smdeFactory = new SmdeFactory();

const viewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
	if (request.pathParts.length === 0) {
		const objectRequest = RequestParser.create({
			url: ``,
			headers: request.headers,
		});
		const smde = await requestFluidObject<Smde>(
			await runtime.getRootDataStore(defaultComponentId),
			objectRequest,
		);
		return {
			status: 200,
			mimeType: "fluid/view",
			value: new SmdeHTMLView(smde),
		};
	}
};

class SmdeContainerFactory extends RuntimeFactoryHelper {
	public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
		const smde = await runtime.createDataStore(smdeFactory.type);
		await smde.trySetAlias(defaultComponentId);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<ContainerRuntime> {
		const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
			[smdeFactory.type, Promise.resolve(smdeFactory)],
		]);

		const runtime: ContainerRuntime = await ContainerRuntime.load(
			context,
			registry,
			buildRuntimeRequestHandler(
				mountableViewRequestHandler(MountableView, [viewRequestHandler]),
			),
			undefined, // runtimeOptions
			undefined, // containerScope
			existing,
		);

		return runtime;
	}
}

export const fluidExport = new SmdeContainerFactory();
