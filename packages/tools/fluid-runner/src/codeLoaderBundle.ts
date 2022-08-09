/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ICodeDetailsLoader, IContainer } from "@fluidframework/container-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";

/**
 * Contract that defines the necessary exports for the bundle provided at runtime
 * For an example, see "src/test/sampleCodeLoaders/sampleCodeLoader.ts"
 */
 export interface ICodeLoaderBundle {
    /**
     * Fluid export of all the required objects and functions
     */
    fluidExport: Promise<IFluidFileConverter>;
}

/**
 * Instance that holds all the details for Fluid file conversion
 */
export interface IFluidFileConverter {
    /**
     * Code loader details to provide at Loader creation
     */
    codeLoader: ICodeDetailsLoader;

    /**
     * Scope object to provide at Loader creation
     */
    scope?: FluidObject;

    /**
     * Execute code and return the results
     * @param container - container created by this application
     * @param scenario - scenario this execution is related to
     * @param logger - passed through logger object
     * @returns - object containing file names as property keys and file content as values
     */
    execute(container: IContainer, scenario: string, logger: ITelemetryBaseLogger): Promise<Record<string, string>>;
}

/**
 * Type cast to ensure necessary methods are present in the provided bundle
 * @param bundle - bundle provided to this application
 */
export function isCodeLoaderBundle(bundle: any): bundle is ICodeLoaderBundle {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return bundle?.fluidExport && typeof bundle.fluidExport === "object";
}

export function isFluidFileConverter(obj: any): obj is IFluidFileConverter {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return obj?.codeLoader && typeof obj.codeLoader === "object"
        && obj.execute && typeof obj.execute === "function";
}
