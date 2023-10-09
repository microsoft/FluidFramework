/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
// eslint-disable-next-line import/no-deprecated
import { buildRuntimeRequestHandler } from "@fluidframework/request-handler";
// eslint-disable-next-line import/no-deprecated
import { mountableViewRequestHandler } from "@fluidframework/aqueduct";
import {
	// eslint-disable-next-line import/no-deprecated
	requestFluidObject,
	RequestParser,
	RuntimeFactoryHelper,
} from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";

import React from "react";

import { CodeMirrorComponent, SmdeFactory } from "./codeMirror";
import { CodeMirrorReactView } from "./codeMirrorView";

export { CodeMirrorComponent, SmdeFactory } from "./codeMirror";
export { CodeMirrorReactView } from "./codeMirrorView";

const defaultComponentId = "default";

const smde = new SmdeFactory();

const viewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
	if (request.pathParts.length === 0) {
		const objectRequest = RequestParser.create({
			url: ``,
			headers: request.headers,
		});
		// eslint-disable-next-line import/no-deprecated
		const codeMirror = await requestFluidObject<CodeMirrorComponent>(
			await runtime.getRootDataStore(defaultComponentId),
			objectRequest,
		);
		return {
			status: 200,
			mimeType: "fluid/view",
			value: React.createElement(CodeMirrorReactView, {
				text: codeMirror.text,
				presenceManager: codeMirror.presenceManager,
			}),
		};
	}
};

class CodeMirrorFactory extends RuntimeFactoryHelper {
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

export const fluidExport = new CodeMirrorFactory();
