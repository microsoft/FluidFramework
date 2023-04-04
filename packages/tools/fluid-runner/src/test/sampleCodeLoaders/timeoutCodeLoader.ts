/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICodeDetailsLoader,
	IContainer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";
import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IFluidFileConverter } from "../../codeLoaderBundle";

async function getCodeLoader(_logger: ITelemetryBaseLogger): Promise<ICodeDetailsLoader> {
	return {
		load: async (): Promise<IFluidModuleWithDetails> => {
			return {
				module: { fluidExport: new BaseContainerRuntimeFactory(new Map()) },
				details: { package: "no-dynamic-package", config: {} },
			};
		},
	};
}

export const executeResult = "result";
async function execute(_container: IContainer, _options?: string): Promise<string> {
	// Wait 10 seconds
	await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
	return executeResult;
}

function getFluidExport(): IFluidFileConverter {
	return {
		getCodeLoader,
		execute,
	};
}

export const fluidExport = getFluidExport();
