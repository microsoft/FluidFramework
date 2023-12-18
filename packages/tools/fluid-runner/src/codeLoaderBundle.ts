/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader, IContainer } from "@fluidframework/container-definitions";
import { ITelemetryBaseLogger, FluidObject } from "@fluidframework/core-interfaces";

/**
 * Contract that defines the necessary exports for the bundle provided at runtime
 * For an example, see "src/test/sampleCodeLoaders/sampleCodeLoader.ts"
 * @internal
 */
export interface ICodeLoaderBundle {
	/**
	 * Fluid export of all the required objects and functions
	 */
	fluidExport: Promise<IFluidFileConverter>;
}

/**
 * Instance that holds all the details for Fluid file conversion
 * @alpha
 */
export interface IFluidFileConverter {
	/**
	 * Get code loader details to provide at Loader creation
	 * @param logger - created logger object to pass to code loader
	 */
	getCodeLoader(logger: ITelemetryBaseLogger): Promise<ICodeDetailsLoader>;

	/**
	 * Get scope object to provide at Loader creation
	 * @param logger - created logger object to pass to scope object
	 */
	getScope?(logger: ITelemetryBaseLogger): Promise<FluidObject>;

	/**
	 * Executes code on container and returns the result
	 * @param container - container created by this application
	 * @param options - additional options
	 */
	execute(container: IContainer, options?: string): Promise<string>;
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
	return (
		obj?.getCodeLoader &&
		typeof obj.getCodeLoader === "function" &&
		obj.execute &&
		typeof obj.execute === "function"
	);
}
