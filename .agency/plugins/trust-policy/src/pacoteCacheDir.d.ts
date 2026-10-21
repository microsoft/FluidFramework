/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// pacote does not export or declare types for its cache location helper; it has no exports map, so the module is importable by path.
declare module "pacote/lib/util/cache-dir.js" {
	/**
	 * Returns npm's default cacache and TUF cache directories, which pacote uses when no cache options are passed.
	 */
	export default function cacheDir(): { cacache: string; tufcache: string };
}
