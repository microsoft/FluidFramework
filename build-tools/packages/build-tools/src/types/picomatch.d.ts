/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Minimal type declarations for the parts of the `picomatch` package that this package uses.
 *
 * `picomatch` ships no type declarations of its own and there is no `@types/picomatch` dependency
 * here, so without this the module would be implicitly `any`.
 */
declare module "picomatch" {
	/**
	 * The subset of the result of `picomatch.scan()` that is used by this package.
	 */
	interface ScanResult {
		/**
		 * Whether the scanned input contains glob syntax.
		 */
		readonly isGlob: boolean;

		/**
		 * The glob portion of the scanned input, with the static {@link ScanResult.base} removed.
		 */
		readonly glob: string;

		/**
		 * The static, non-glob leading portion of the scanned input.
		 */
		readonly base: string;
	}

	/**
	 * Creates a matcher function for the given glob pattern.
	 */
	function picomatch(pattern: string): (value: string) => boolean;

	namespace picomatch {
		/**
		 * Splits a glob pattern into its static base and its glob portion.
		 */
		function scan(input: string): ScanResult;
	}

	export default picomatch;
}
