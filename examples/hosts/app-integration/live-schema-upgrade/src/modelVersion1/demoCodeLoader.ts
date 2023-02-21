/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ICodeDetailsLoader,
	IFluidCodeDetails,
	IFluidCodeDetailsComparer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";

import { getLatestVersion } from "../app";
import { DiceRollerContainerRuntimeFactory } from ".";

const v1ModuleWithDetails: IFluidModuleWithDetails = {
	module: { fluidExport: new DiceRollerContainerRuntimeFactory() },
	details: { package: "1.0" },
};

export class DemoCodeLoader implements ICodeDetailsLoader {
	public async load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
		const version = source.package;
		if (typeof version !== "string") {
			throw new TypeError("Unexpected code detail format");
		}
		switch (version) {
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
		// For this example, we will accept any minor version upgrade. For example, if the latest version is 1.1, then
		// the following will return true, but 2.0 will return false.
		satisfies: async (a, b) => {
			const aVersion = Math.trunc(Number(a.package as string));
			const bVersion = Math.trunc(Number(b.package as string));
			const latestVersion = Math.trunc(Number(await getLatestVersion()));
			return aVersion === bVersion && aVersion === Number(latestVersion);
		},
	};
}
