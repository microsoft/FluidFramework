/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: "summarizer-delay-loaded-not-statically-imported",
			severity: "error",
			comment:
				"The summarizer must stay dynamically importable so a bundler can split it into its own " +
				"chunk that non-summarizer clients never download. Only the dynamic import in " +
				"containerRuntime.ts and the (statically unused, tree-shaken) re-export in summary/index.ts " +
				"may reference summaryDelayLoadedModule. A new static value import from anywhere else would " +
				"pull the summarizer back into the initial chunk and silently defeat the delay-load. If you " +
				"need a type from that module, use `import type` (erased before bundling); if you need a " +
				"value at runtime, load it via the existing dynamic import in containerRuntime.ts.",
			from: {
				pathNot: [
					"^src/summary/summaryDelayLoadedModule/", // the delay-loaded module's own internals
					"^src/summary/index\\.ts$", // the barrel's re-export (statically unused -> tree-shaken)
				],
			},
			to: {
				path: "^src/summary/summaryDelayLoadedModule(/|$)",
				// Allow the dynamic import(). `import type` edges are erased before bundling and are not
				// tracked by default (tsPreCompilationDeps is left at its false default), so they need no
				// exemption here.
				dependencyTypesNot: ["dynamic-import"],
			},
		},
	],
	options: {
		doNotFollow: {
			path: "node_modules",
		},
		includeOnly: "^src/",
	},
};
