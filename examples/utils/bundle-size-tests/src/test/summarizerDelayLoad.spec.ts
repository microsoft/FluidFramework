/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

// webpack ships as a CommonJS module, so it must be default-imported (its `webpack` named export is
// not available to ESM at runtime). Bind it under a non-colliding name to satisfy import-x lint rules.
import webpackBundler from "webpack";

// The package root, two levels up from this compiled test (lib/test/<name>.js).
const packageRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The compiled entry that calls loadContainerRuntime, mirroring how a real app consumes the runtime.
// This is the same entry webpack.config.cjs bundles; it intentionally does not import the package
// index or statically reference the summarizer, either of which would pull the summarizer into the
// initial chunk via the static `./summary/index.js` import. The main build preserves the `src/`
// folder under `lib/` (the test build, by contrast, emits to `lib/test/`), so the entry lives here.
const entryPath = resolvePath(packageRoot, "lib", "src", "containerRuntimeBundle.js");

// Minimal view of the parts of the webpack stats JSON that this test inspects.
interface StatsModule {
	readonly name?: string;
	readonly identifier?: string;
	readonly chunks?: readonly (string | number)[];
}
interface StatsJson {
	readonly errors?: readonly { readonly message?: string }[];
	readonly entrypoints?: Readonly<
		Record<string, { readonly chunks?: readonly (string | number)[] }>
	>;
	readonly modules?: readonly StatsModule[];
}

// The delay-loaded summarizer lives under this source path in @fluidframework/container-runtime.
const summarizerModulePattern = /summary[/\\]summaryDelayLoadedModule[/\\]/;

/**
 * Verifies that container-runtime's summarizer is delay-loaded into its own chunk rather than baked
 * into the bundle that every (non-summarizer) client downloads.
 *
 * This compiles a minimal container-runtime entry with webpack in-process and inspects the resulting
 * chunk graph. It is intentionally hermetic: the only external requirement is that this package and
 * its container-runtime dependency are built.
 *
 * The compile uses `optimization.providedExports: false` on purpose. The point of importing the
 * delay-loaded module by its leaf path (`./summary/summaryDelayLoadedModule/index.js`) instead of via
 * the `./summary/index.js` barrel is that the chunk split no longer depends on the bundler tracing
 * re-export provenance through the barrel. Disabling `providedExports` models a bundler without that
 * analysis: under it, dynamically importing the barrel leaves the summarizer in the initial chunk,
 * while importing the leaf still splits it out.
 */
describe("summarizer delay-load", () => {
	it("splits the summarizer into a lazy chunk excluded from the container-runtime entry", async function () {
		// Only container-runtime's own modules are compiled here (its third-party dependency closure is
		// externalized below), but webpack startup plus that compile still warrants a generous timeout.
		this.timeout(30_000);

		const stats = await new Promise<webpackBundler.Stats>((resolve, reject) => {
			webpackBundler(
				{
					context: packageRoot,
					entry: { containerRuntime: entryPath },
					// Externalize everything that isn't container-runtime's own source. The summarizer is
					// reached via a *relative* dynamic import inside container-runtime, so the entire path to
					// the chunk split is internal; bare-specifier dependencies are never on it. Stubbing them
					// at the module boundary avoids parsing container-runtime's large dependency closure
					// without changing the summarizer's chunk placement.
					externals: [
						(
							{ request }: { request?: string },
							callback: (err?: null, result?: string) => void,
						): void => {
							// Keep container-runtime's own modules in the graph: relative/absolute requests and
							// its own entrypoints (e.g. ".../internal"). The trailing-slash check avoids matching
							// siblings such as "@fluidframework/container-runtime-definitions". Everything else
							// (other packages, node builtins) is stubbed; the bundle is never executed.
							if (
								request === undefined ||
								request.startsWith(".") ||
								isAbsolute(request) ||
								request === "@fluidframework/container-runtime" ||
								request.startsWith("@fluidframework/container-runtime/")
							) {
								callback();
							} else {
								callback(undefined, `commonjs2 ${request}`);
							}
						},
					],
					mode: "production",
					optimization: {
						// Disable minification (speed) and module concatenation, so every module is attributed to
						// its chunk individually in the stats (concatenated modules are otherwise hoisted out of
						// the per-module chunk listing). Neither affects chunk placement.
						minimize: false,
						concatenateModules: false,
						// Model a bundler that does not trace re-export provenance through the barrel. This is what
						// makes the leaf import observably better than a barrel import: with providedExports
						// disabled, a barrel import would leave the summarizer in the initial chunk, so the test
						// fails if the delay-load regresses to importing `./summary/index.js`. See the describe()
						// comment for details.
						providedExports: false,
					},
					resolve: {
						modules: [resolvePath(packageRoot, "node_modules"), "node_modules"],
						extensions: [".mjs", ".js", ".cjs"],
						// The runtime references the node core `assert`; the real bundle blocks its polyfill.
						fallback: { assert: false },
					},
					// `library` mirrors the real bundle config so the entry's exports (and therefore the
					// loadContainerRuntime import) are retained rather than tree-shaken away. Asset emission is
					// skipped below, so no output path is needed.
					output: { library: "bundle" },
					node: false,
					// We only read `stats`; skip writing emitted assets to disk.
					plugins: [
						{
							apply(compiler: webpackBundler.Compiler): void {
								compiler.hooks.shouldEmit.tap("skip-emit", () => false);
							},
						},
					],
				},
				(err, result) => {
					if (err !== null && err !== undefined) {
						reject(err);
					} else if (result === undefined) {
						reject(new Error("webpack returned no stats"));
					} else {
						resolve(result);
					}
				},
			);
		});

		const info = stats.toJson({
			all: false,
			entrypoints: true,
			modules: true,
			ids: true,
			errors: true,
		}) as unknown as StatsJson;

		assert.equal(
			stats.hasErrors(),
			false,
			`webpack reported errors:\n${(info.errors ?? []).map((e) => e.message ?? "").join("\n")}`,
		);

		const entrypoint = info.entrypoints?.containerRuntime;
		assert(
			entrypoint !== undefined,
			"expected a 'containerRuntime' entrypoint in the webpack stats",
		);
		// The chunks loaded eagerly when the entry loads.
		const initialChunkIds = new Set(entrypoint.chunks ?? []);

		// Every module belonging to the delay-loaded summarizer, mapped to the chunk(s) it lives in.
		// `concatenateModules` is disabled, so the stats module list is already flat (no nested
		// children to traverse).
		const summarizerModules = (info.modules ?? []).filter((module) =>
			summarizerModulePattern.test(module.name ?? module.identifier ?? ""),
		);

		// Sanity: the summarizer must actually be in the graph, otherwise the checks below could pass
		// vacuously (e.g. if the module were renamed/moved so the pattern stopped matching).
		assert(
			summarizerModules.length > 0,
			"expected to find summaryDelayLoadedModule modules in the bundle graph (has the module moved?)",
		);

		const summarizerChunkIds = new Set(
			summarizerModules.flatMap((module) => [...(module.chunks ?? [])]),
		);

		// 1. Exclusion: the summarizer must not live in any chunk loaded eagerly with the entry.
		const summarizerInitialChunkIds = [...summarizerChunkIds].filter((id) =>
			initialChunkIds.has(id),
		);
		assert.deepEqual(
			summarizerInitialChunkIds,
			[],
			"the summarizer must not be in the container-runtime entry's initial (eagerly-loaded) chunks",
		);

		// 2. Split: the summarizer must live in at least one separate, lazily-loaded chunk.
		const summarizerLazyChunkIds = [...summarizerChunkIds].filter(
			(id) => !initialChunkIds.has(id),
		);
		assert(
			summarizerLazyChunkIds.length > 0,
			"expected the summarizer to be split into a separate, lazily-loaded chunk",
		);
	});
});
