/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { Package } from "@fluidframework/build-tools";
import path from "node:path";
import { BaseCommand } from "../../base";

/**
 * A type defining the four release types:
 *
 * - alpha
 *
 * - beta
 *
 * - public
 *
 * - internal
 */
type UpdatePackageJsonTypes = "alpha" | "beta" | "public" | "internal";

/**
 * A typeguard to check if a string is a {@link UpdatePackageJsonTypes}.
 */
function isUpdatePackageJsonTypes(type: string): type is UpdatePackageJsonTypes {
	return type === "alpha" || type === "internal" || type === "beta" || type === "public";
}

export default class UpdatePackageTypesCommand extends BaseCommand<
	typeof UpdatePackageTypesCommand
> {
	static readonly description = "";

	static flags = {
		types: Flags.custom<UpdatePackageJsonTypes>({
			description: "",
			default: "public",
			parse: async (input) => {
				if (isUpdatePackageJsonTypes(input)) {
					return input;
				}
				throw new Error(`Invalid release type: ${input}`);
			},
		})(),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {}
}
