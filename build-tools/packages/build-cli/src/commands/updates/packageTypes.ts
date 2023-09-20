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
	static readonly description = "Updates the types in package.json based on the release flag";

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

	public async run(): Promise<void> {
		const flags = this.flags;

		const pkg = new Package(path.join(".", "package.json"), "none");

		const pkgApiRollup = new Package(path.join(".", "api-extractor.json"), "none");

		this.log(`Package: ${pkg}`);

		this.log(`Ap extractor: ${pkgApiRollup}`);
	}
}
