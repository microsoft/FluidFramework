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
import { DiceRollerContainerRuntimeFactory } from "./modelVersion2/index.js";

const v2ModuleWithDetails: IFluidModuleWithDetails = {
	module: { fluidExport: new DiceRollerContainerRuntimeFactory() },
	details: { package: "2.0" },
};

// This code loader is used in version 2.0 of the app. In a production app, there will likely only be one code loader.
export class DemoCodeLoader implements ICodeDetailsLoader {
	public async load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
		const version = source.package;
		if (typeof version !== "string") {
			throw new TypeError("Unexpected code detail format");
		}
		switch (version) {
			case "1.0":
			case "2.0":
				// In this example we will load both 1.0 and 2.0 versions with the latest code since we will be
				// upgrading shortly after.
				return v2ModuleWithDetails;
			default:
				throw new Error("Unknown version");
		}
	}

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
