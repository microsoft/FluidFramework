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

import { DiceRollerContainerRuntimeFactory as DiceRollerContainerRuntimeFactory2 } from ".";

const v2ModuleWithDetails: IFluidModuleWithDetails = {
	module: { fluidExport: new DiceRollerContainerRuntimeFactory2() },
	details: { package: "2.0"},
};

export class DemoCodeLoader implements ICodeDetailsLoader {
	public async load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
		const version = source.package;
		if (typeof version !== "string") {
			throw new TypeError("Unexpected code detail format");
		}
		switch (version) {
			case "1.0":
			case "2.0":
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
			console.log("compare:", aVersion, bVersion, (aVersion - bVersion));
			return aVersion - bVersion;
		},
		satisfies: async (a, b) => {
			const aVersion = Number(a.package as string);
			const bVersion = Number(b.package as string);
			console.log("satisfies:", aVersion, bVersion);
			return true;
		}
	};
}
