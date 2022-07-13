/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader, IContainer, IFluidModuleWithDetails } from "@fluidframework/container-definitions";
import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

export async function getCodeLoader(): Promise<ICodeDetailsLoader> {
    return {
        load: async (): Promise<IFluidModuleWithDetails> => {
            return {
                module: { fluidExport: new BaseContainerRuntimeFactory(new Map()) },
                details: { package: "no-dynamic-package", config: {} },
            };
        },
    };
}

export async function getResult(_container: IContainer, _logger: ITelemetryBaseLogger): Promise<string> {
    return "sample result";
}
