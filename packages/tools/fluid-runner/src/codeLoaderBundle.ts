/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ICodeDetailsLoader,
	IContainer,
} from "@fluidframework/container-definitions/internal";
import type { FluidObject, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

/**
 * Contract that defines the necessary exports for the bundle provided at runtime
 * For an example, see "src/test/sampleCodeLoaders/sampleCodeLoader.ts"
 * @internal
 */
export interface ICodeLoaderBundle {
	/**
	 * Fluid export of all the required objects and functions
	 */
	fluidExport: Promise<FluidFileConverter>;
}

/**
 * Instance that holds all the details for Fluid file conversion
 * @legacy @beta
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
 * Instance that holds all the details for Fluid file conversion with binary output.
 * @internal
 */
export interface IFluidFileConverterWithBinaryOutput {
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
	 * Executes code on container and returns the binary result
	 * @param container - container created by this application
	 * @param options - additional options
	 */
	execute(container: IContainer, options?: string): Promise<Uint8Array>;
}

/**
 * A file in a directory produced by a Fluid file converter.
 * @internal
 */
export interface IFluidFileConverterDirectoryFile {
	/**
	 * Portable, forward-slash-separated path relative to the output directory.
	 */
	readonly path: string;

	/**
	 * File content. Strings are written as UTF-8 and `Uint8Array` values are written unchanged.
	 */
	readonly content: string | Uint8Array;
}

/**
 * A directory tree produced by a Fluid file converter.
 * @internal
 */
export interface IFluidFileConverterDirectoryOutput {
	/**
	 * Optional explicit directories, including empty directories, to create beneath the output
	 * directory. Paths are portable, use forward slashes, and are relative to the output directory.
	 */
	readonly directories?: readonly string[];

	/**
	 * Files to create beneath the output directory.
	 */
	readonly files: readonly IFluidFileConverterDirectoryFile[];
}

/**
 * Instance that holds all the details for Fluid file conversion with directory output.
 * @internal
 */
export interface IFluidFileConverterWithDirectoryOutput {
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
	 * Executes code on container and returns the directory result.
	 * @param container - container created by this application
	 * @param options - additional options
	 */
	execute(
		container: IContainer,
		options?: string,
	): Promise<IFluidFileConverterDirectoryOutput>;
}

/**
 * A Fluid file converter with text, binary, or directory output.
 * @internal
 */
export type FluidFileConverter =
	| IFluidFileConverter
	| IFluidFileConverterWithBinaryOutput
	| IFluidFileConverterWithDirectoryOutput;

/**
 * Type cast to ensure necessary methods are present in the provided bundle
 * @param bundle - bundle provided to this application
 */
export function isCodeLoaderBundle(bundle: any): bundle is ICodeLoaderBundle {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return bundle?.fluidExport && typeof bundle.fluidExport === "object";
}

export function isFluidFileConverter(obj: any): obj is FluidFileConverter {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return (
		obj?.getCodeLoader &&
		typeof obj.getCodeLoader === "function" &&
		obj.execute &&
		typeof obj.execute === "function"
	);
}
