/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICodeDetailsLoader,
	IFluidCodeDetails,
	IFluidModuleWithDetails,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";

/**
 * The StaticCodeLoader isn't directly a core piece of model loading, but since most of our examples don't require
 * advanced code loading it simplifies the instantiation of the model loader.
 * @internal
 */
export class StaticCodeLoader implements ICodeDetailsLoader {
	public constructor(private readonly runtimeFactory: IRuntimeFactory) {}

	public async load(details: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
		return {
			module: { fluidExport: this.runtimeFactory },
			details,
		};
	}
}
