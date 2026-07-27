/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Virtual module (see the `emoji-data-url` alias in webpack.config.cjs) that resolves to the
 * emoji-picker-element data file. Webpack emits that file as a standalone asset, so the import
 * yields the URL the asset is served from rather than the parsed JSON contents.
 */
declare module "emoji-data-url" {
	const dataUrl: string;
	// eslint-disable-next-line import-x/no-default-export -- webpack asset modules expose the asset URL as the default export
	export default dataUrl;
}
