/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Optional Node 24 source-validation fallback for an already-installed checkout
// whose generated lib/ files are stale. Uses the actual TS compiler and Mocha;
// it does NOT mock Fluid implementations or replace normal builds/API checks.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire, registerHooks } from "node:module";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const require = createRequire(import.meta.url);
let ts = require("typescript");
if (Number.parseInt(ts.version, 10) < 6) {
	// A stale workspace link can point at TS5 even when the declared TS6 is cached.
	const manifest = JSON.parse(
		fs.readFileSync(path.join(root, "packages/test/local-server-tests/package.json"), "utf8"),
	);
	const version = manifest.devDependencies.typescript.replace("~", "");
	ts = require(
		path.join(root, `node_modules/.pnpm/typescript@${version}/node_modules/typescript`),
	);
}
const packages = new Map();
function scan(dir) {
	if (fs.existsSync(path.join(dir, "package.json"))) {
		const p = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
		if (p.name) packages.set(p.name, { dir, p });
		return;
	}
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (
			entry.isDirectory() &&
			!entry.name.startsWith(".") &&
			!["node_modules", "lib", "dist"].includes(entry.name)
		)
			scan(path.join(dir, entry.name));
	}
}
scan(path.join(root, "packages"));
function choose(entry) {
	if (typeof entry === "string") return entry;
	if (!entry) return undefined;
	return choose(entry.import) ?? choose(entry.default) ?? choose(entry.node);
}
function workspaceSource(specifier) {
	const [scope, name, ...sub] = specifier.split("/");
	const pack = packages.get(`${scope}/${name}`);
	if (!pack) return undefined;
	const key = sub.length ? `./${sub.join("/")}` : ".";
	const entry =
		choose(pack.p.exports?.[key]) ?? (sub.length === 0 ? "./lib/index.js" : undefined);
	if (!entry) return undefined;
	const source = path.resolve(
		pack.dir,
		entry.replace(/^\.\/(?:lib|dist)\//, "./src/").replace(/\.([cm]?)js$/, ".$1ts"),
	);
	return fs.existsSync(source) ? source : undefined;
}
const roots = process.argv
	.filter((arg) => arg.endsWith(".ts"))
	.flatMap((arg) => Array.from(fs.globSync(arg), (file) => path.resolve(file)));
const options = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	skipLibCheck: true,
	strict: true,
	noImplicitAny: false,
	noUnusedLocals: true,
	types: ["mocha", "node"],
	useDefineForClassFields: false,
	noEmitOnError: false,
	ignoreDeprecations: "6.0",
};
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) =>
	names.map((name) => {
		const source = name.startsWith("@") ? workspaceSource(name) : undefined;
		return source
			? {
					resolvedFileName: source,
					extension: source.endsWith(".cts") ? ts.Extension.Cts : ts.Extension.Ts,
				}
			: ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
	});
const program = ts.createProgram(roots, options, host);
const outputs = new Map();
program.emit(undefined, (fileName, text, _bom, _error, sourceFiles) => {
	if (/\.(?:c|m)?js$/.test(fileName) && sourceFiles?.length === 1)
		outputs.set(path.normalize(sourceFiles[0].fileName), text);
});
if (process.env.SEED_TYPECHECK === "1") {
	const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => {
		const file = d.file?.fileName.replaceAll("\\", "/");
		return (
			file?.includes("/seedProjection/") ||
			file?.endsWith("/container-runtime/src/containerRuntime.ts") ||
			file?.endsWith("/containerRuntime.experimentalSummary.spec.ts")
		);
	});
	console.log(
		ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCurrentDirectory: () => process.cwd(),
			getCanonicalFileName: (f) => f,
			getNewLine: () => "\n",
		}),
	);
	if (diagnostics.length) process.exit(1);
	console.log("Targeted source typecheck passed (reference and changed runtime files).");
}
registerHooks({
	resolve(specifier, context, next) {
		if (specifier.startsWith("@")) {
			const source = workspaceSource(specifier);
			if (source) return { url: pathToFileURL(source).href, shortCircuit: true };
		}
		if (/\.(?:c|m)?js$/.test(specifier) && context.parentURL?.startsWith("file:")) {
			const url = new URL(specifier, context.parentURL);
			const source = fileURLToPath(url).replace(/\.([cm]?)js$/, ".$1ts");
			if (source.startsWith(root) && fs.existsSync(source) && !source.includes("node_modules"))
				return { url: pathToFileURL(source).href, shortCircuit: true };
		}
		return next(specifier, context);
	},
	load(url, context, next) {
		if (
			url.startsWith("file:") &&
			/\.(?:c|m)?ts$/.test(url) &&
			!url.includes("/node_modules/")
		) {
			const fileName = fileURLToPath(url);
			const source =
				outputs.get(path.normalize(fileName)) ??
				ts.transpileModule(fs.readFileSync(fileName, "utf8"), {
					fileName,
					compilerOptions: {
						target: ts.ScriptTarget.ES2022,
						module: url.endsWith(".cts") ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext,
						useDefineForClassFields: false,
						sourceMap: false,
					},
				}).outputText;
			return {
				format: url.endsWith(".cts") ? "commonjs" : "module",
				source,
				shortCircuit: true,
			};
		}
		return next(url, context);
	},
});
