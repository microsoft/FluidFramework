/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct/internal";
import {
	ICodeDetailsLoader,
	IContainer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions/internal";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

import { IFluidFileConverter } from "../../codeLoaderBundle.js";

// If the test collateral includes code proposals, the code loader must implement IFluidCodeDetailsComparer, or else
// the container will immediately be closed.  This implementation is a naive approach that claims all code details are
// equivalent and are satisfied by the currently loaded module.  This may be appropriate in some cases (e.g. for truly
// static-loaded modules like this is doing with no-dynamic-package), but it's not a good representation of what ODSP
// and Loop do in practice.
// TODO:  Evaluate whether this naive comparison approach is appropriate for the scenario we are trying to test.
export class SampleCodeLoader implements ICodeDetailsLoader {
	public get IFluidCodeDetailsComparer() {
		return this;
	}
	public async load(): Promise<IFluidModuleWithDetails> {
		return {
			module: {
				fluidExport: new BaseContainerRuntimeFactory({
					registryEntries: new Map(),
					provideEntryPoint: async () => ({
						myProp: "myValue",
					}),
				}),
			},
			details: { package: "no-dynamic-package", config: {} },
		};
	}
	public async satisfies() {
		return true;
	}
	public async compare() {
		return 0;
	}
}

async function getCodeLoader(_logger: ITelemetryBaseLogger): Promise<ICodeDetailsLoader> {
	return new SampleCodeLoader();
}

export const executeResult = "result";
async function execute(_container: IContainer, _options?: string): Promise<string> {
	return executeResult;
}

function getFluidExport(): IFluidFileConverter {
	return {
		getCodeLoader,
		execute,
	};
}

export const fluidExport = getFluidExport();
