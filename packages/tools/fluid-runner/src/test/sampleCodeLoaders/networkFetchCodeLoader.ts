/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader, IContainer } from "@fluidframework/container-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IFluidFileConverter } from "../../codeLoaderBundle";
import { SampleCodeLoader } from "./sampleCodeLoader";

async function getCodeLoader(_logger: ITelemetryBaseLogger): Promise<ICodeDetailsLoader> {
	return new SampleCodeLoader();
}

export const executeResult = "result";
async function execute(_container: IContainer, _options?: string): Promise<string> {
	// Make a network fetch call
	await fetch("https://www.microsoft.com/");
	return executeResult;
}

function getFluidExport(): IFluidFileConverter {
	global.fetch = (async () => {
		return undefined;
	}) as any;
	return {
		getCodeLoader,
		execute,
	};
}

export const fluidExport = getFluidExport();
