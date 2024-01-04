/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type NewlineKind } from "@rushstack/node-core-library";

/**
 * Configuration for interacting with the file-system.
 *
 * @public
 */
export interface FileSystemConfiguration {
	/**
	 * The directory under which the document files will be generated.
	 */
	outputDirectoryPath: string;

	/**
	 * Specifies what type of newlines API Documenter should use when writing output files.
	 *
	 * @defaultValue {@link @rushstack/node-core-library#NewlineKind.OsDefault}
	 */
	readonly newlineKind?: NewlineKind;
}
