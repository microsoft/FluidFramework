/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
// eslint-disable-next-line import/no-deprecated
import { buildRuntimeRequestHandler } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import {
	// eslint-disable-next-line import/no-deprecated
	requestFluidObject,
	RequestParser,
	RuntimeFactoryHelper,
} from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";

import React from "react";

import { SmdeDataObject, SmdeFactory } from "./smde";
import { SmdeReactView } from "./smdeView";

const defaultComponentId = "default";

const smde = new SmdeFactory();

const viewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
	if (request.pathParts.length === 0) {
		const objectRequest = RequestParser.create({
			url: ``,
			headers: request.headers,
		});
		// eslint-disable-next-line import/no-deprecated
		const smdeDataObject = await requestFluidObject<SmdeDataObject>(
			await runtime.getRootDataStore(defaultComponentId),
			objectRequest,
		);
		return {
			status: 200,
			mimeType: "fluid/view",
			value: React.createElement(SmdeReactView, {
				smdeDataObject,
			}),
		};
	}
};

class SmdeContainerFactory extends RuntimeFactoryHelper {
	public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(smde.type);
		await dataStore.trySetAlias(defaultComponentId);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<ContainerRuntime> {
		const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
			[smde.type, Promise.resolve(smde)],
		]);

		const runtime: ContainerRuntime = await ContainerRuntime.load(
			context,
			registry,
			// eslint-disable-next-line import/no-deprecated
			buildRuntimeRequestHandler(
				// eslint-disable-next-line import/no-deprecated
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
