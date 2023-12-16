/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidPackage, isFluidPackage, IFluidPackageEnvironment } from "./fluidPackage";

/**
 * A specific Fluid package environment for browsers
 * @alpha
 */
export interface IFluidBrowserPackageEnvironment extends IFluidPackageEnvironment {
	/**
	 * The Universal Module Definition (umd) target specifics the scripts necessary for
	 * loading a packages in a browser environment and finding its entry point.
	 */
	umd: {
		/**
		 * The bundled js files for loading this package.
		 * These files will be loaded and executed in order.
		 */
		files: string[];

		/**
		 * The global name that the script entry points will be exposed.
		 * This entry point should be an {@link @fluidframework/container-definitions#IFluidModule}.
		 */
		library: string;
	};
}

/**
 * A Fluid package for specification for browser environments
 * @alpha
 */
export interface IFluidBrowserPackage extends IFluidPackage {
	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidPackage.fluid}
	 */
	fluid: {
		/**
		 * The browser specific package information for this package
		 */
		browser: IFluidBrowserPackageEnvironment;
		/**
		 * {@inheritDoc @fluidframework/core-interfaces#IFluidPackage.fluid.environment}
		 */
		[environment: string]: IFluidPackageEnvironment;
	};
}

/**
 * Determines if any object is an IFluidBrowserPackage
 * @param maybePkg - The object to check for compatibility with IFluidBrowserPackage
 * @alpha
 */
export const isFluidBrowserPackage = (
	maybePkg: unknown,
): maybePkg is Readonly<IFluidBrowserPackage> =>
	isFluidPackage(maybePkg) &&
	typeof maybePkg?.fluid?.browser?.umd?.library === "string" &&
	Array.isArray(maybePkg?.fluid?.browser?.umd?.files);
