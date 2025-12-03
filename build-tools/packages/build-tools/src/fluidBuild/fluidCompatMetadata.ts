/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Metadata used for Fluid compatibility tracking and validation.
 */
export interface IFluidCompatibilityMetadata {
	/** The current compatibility generation of a Fluid layer which is used for validating layer compatibility */
	generation: number;
	/** The release date when the generation was last updated. Must be in YYYY-MM-DD format */
	releaseDate: string;
	/** The release version when the generation was last updated. Must be in valid semver format */
	releasePkgVersion: string;
}
