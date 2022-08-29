/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader, IContainer, IFluidModuleWithDetails } from "@fluidframework/container-definitions";
import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IFluidFileConverter } from "../../codeLoaderBundle";

async function getCodeLoader(): Promise<ICodeDetailsLoader> {
    return {
        load: async (): Promise<IFluidModuleWithDetails> => {
            return {
                module: { fluidExport: new BaseContainerRuntimeFactory(new Map()) },
                details: { package: "no-dynamic-package", config: {} },
            };
        },
    };
}

async function execute(
    _container: IContainer,
    scenario: string,
    _logger: ITelemetryBaseLogger,
): Promise<Record<string, string>> {
    return { "result.txt": scenario };
}

async function getFluidExport(): Promise<IFluidFileConverter> {
    return {
        codeLoader: await getCodeLoader(),
        execute,
    };
}

export const fluidExport = getFluidExport();
