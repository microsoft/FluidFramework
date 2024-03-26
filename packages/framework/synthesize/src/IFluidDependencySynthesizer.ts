/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncFluidObjectProvider, FluidObjectSymbolProvider } from "./types.js";

/**
 * @alpha
 */
export const IFluidDependencySynthesizer: keyof IProvideFluidDependencySynthesizer =
	"IFluidDependencySynthesizer";

/**
 * @alpha
 */
export interface IProvideFluidDependencySynthesizer {
	IFluidDependencySynthesizer: IFluidDependencySynthesizer;
}

/**
 * IFluidDependencySynthesizer can generate FluidObjects based on the IProvideFluidObject pattern.
 * It allow for registering providers and uses synthesize to generate a new object with the optional
 * and required types.
 * @alpha
 */
export interface IFluidDependencySynthesizer extends IProvideFluidDependencySynthesizer {
	/**
	 * synthesize takes optional and required types and returns an object that will fulfill the
	 * defined types based off objects that has been previously registered.
	 *
	 * @param optionalTypes - optional types to be in the Scope object
	 * @param requiredTypes - required types that need to be in the Scope object
	 */
	synthesize<O, R = undefined | Record<string, never>>(
		optionalTypes: FluidObjectSymbolProvider<O>,
		requiredTypes: Required<FluidObjectSymbolProvider<R>>,
	): AsyncFluidObjectProvider<O, R>;

	/**
	 * Check if a given type is registered
	 * @param type - Type to check
	 */
	has(type: string): boolean;
}
