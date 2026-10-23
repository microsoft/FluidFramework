/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// pacote neither exports nor declares types for its cache directory helper. pacote has no exports map, so the module can be imported by path.
declare module "pacote/lib/util/cache-dir.js" {
	/**
	 * Returns npm's default content cache (`cacache`) and TUF cache (`tufcache`) directories, which pacote uses when no cache options are passed.
	 */
	export default function cacheDir(): { cacache: string; tufcache: string };
}
