/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ICodeDetailsLoader,
	IFluidCodeDetails,
	IFluidCodeDetailsComparer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions/legacy";

import { getLatestVersion } from "./app.js";
import { DiceRollerContainerRuntimeFactory } from "./modelVersion1/index.js";

const v1ModuleWithDetails: IFluidModuleWithDetails = {
	module: { fluidExport: new DiceRollerContainerRuntimeFactory() },
	details: { package: "1.0" },
};

// This code loader is used in version 1.0 of the app. In a production app, there will likely only be one code loader.
export class DemoCodeLoader implements ICodeDetailsLoader {
	public async load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
		const version = source.package;
		if (typeof version !== "string") {
			throw new TypeError("Unexpected code detail format");
		}
		switch (version) {
			// In this version of the app the code loader only knows about 1.0.
			case "1.0":
				return v1ModuleWithDetails;
			default:
				throw new Error("Unknown version");
		}
	}

	// Note: If IFluidCodeDetailsComparer was not implemented in the first version of the app, it will simply reject
	// any new code proposals. This is because the compare/satisfies functions will default to returning false if not
	// implemented.
	public IFluidCodeDetailsComparer: IFluidCodeDetailsComparer = {
		get IFluidCodeDetailsComparer() {
			return this;
		},
		compare: async (a, b) => {
			const aVersion = Number(a.package as string);
			const bVersion = Number(b.package as string);
			return aVersion - bVersion;
		},
		// For this example, we reject any code proposals that are not equal to our current version.
		satisfies: async (a, b) => {
			const aVersion = Math.trunc(Number(a.package as string));
			const bVersion = Math.trunc(Number(b.package as string));
			const latestVersion = Number(await getLatestVersion());
			return aVersion === bVersion && aVersion === latestVersion;
		},
	};
}
