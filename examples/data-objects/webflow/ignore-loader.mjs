const extensionsRegex = /\.css$/;

/**
 * This uses the node loader API (see https://nodejs.org/docs/latest-v16.x/api/esm.html#loaders)
 * to enable webpack-style imports of .css modules.
 *
 * This is the recommended successor to `require.extensions`, which was used by https://www.npmjs.com/package/ignore-styles
 * to accomplish the same thing.
 */
export async function load(url, context, nextLoad) {
	if (extensionsRegex.test(url)) {
		return {
			format: "json",
			source: "{}",
		};
	}

	// Defer to the next hook in the chain.
	return nextLoad(url, context);
}
