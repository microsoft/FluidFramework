/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is a node powered CLI application, so using node makes sense:
/* eslint-disable unicorn/no-process-exit */
/* eslint-disable import/no-nodejs-modules */

import { readFileSync, writeFileSync } from "node:fs";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { SerializedIdCompressorWithOngoingSession } from "@fluidframework/id-compressor/internal";
import {
	createIdCompressor,
	deserializeIdCompressor,
} from "@fluidframework/id-compressor/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import {
	extractPersistedSchema,
	FluidClientVersion,
	independentInitializedView,
	TreeBeta,
	typeboxValidator,
	type ForestOptions,
	type ICodecOptions,
	type JsonCompatible,
	type VerboseTree,
	type ViewContent,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/alpha";
import { type Static, Type } from "@sinclair/typebox";

import { config, List } from "./schema.js";

/**
 * Load from file.
 */
export function loadDocument(source: string | undefined): List {
	if (source === undefined || source === "default") {
		return new List([]);
	}
	const parts = source.split(".");
	if (parts.length < 3 || parts.at(-1) !== "json") {
		console.log(`Invalid source: ${source}`);
		process.exit(1);
	}

	// Data parsed from JSON is safe to consider JsonCompatible.
	// If file is invalid JSON, that will throw and is fine for this app.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const fileData: JsonCompatible = JSON.parse(readFileSync(source).toString());

	switch (parts.at(-2)) {
		case "concise": {
			return TreeBeta.importConcise(List, fileData);
		}
		case "verbose": {
			return TreeBeta.importVerbose(List, fileData as VerboseTree);
		}
		case "compressed": {
			const content: ViewContent = {
				schema: extractPersistedSchema(List),
				tree: fileData,
				idCompressor: createIdCompressor(),
			};
			const view = independentInitializedView(config, options, content);
			return view.root;
		}
		case "snapshot": {
			// TODO: validate
			const combo: File = fileData as File;

			const content: ViewContent = {
				schema: combo.schema,
				tree: combo.tree,
				idCompressor: deserializeIdCompressor(combo.idCompressor),
			};
			const view = independentInitializedView(config, options, content);
			return view.root;
		}
		default: {
			console.log(`Invalid source format: ${parts.at(-2)}`);
			process.exit(1);
		}
	}
}

/**
 * Save to file.
 */
export function saveDocument(destination: string | undefined, tree: List): void {
	if (destination === undefined || destination === "default") {
		console.log("Tree Content:");
		console.log(tree);
		return;
	}
	const parts = destination.split(".");
	if (parts.length < 3 || parts.at(-1) !== "json") {
		console.log(`Invalid destination: ${destination}`);
		process.exit(1);
	}

	const fileData: JsonCompatible = exportContent(destination, tree);
	console.log(`Writing: ${destination}`);
	writeFileSync(destination, JSON.stringify(fileData, rejectHandles));
}

/**
 * Encode to format based on file name.
 */
export function exportContent(destination: string, tree: List): JsonCompatible {
	const parts = destination.split(".");
	if (parts.length < 3 || parts.at(-1) !== "json") {
		console.log(`Invalid destination: ${destination}`);
		process.exit(1);
	}

	switch (parts.at(-2)) {
		case "concise": {
			return TreeBeta.exportConcise(tree) as JsonCompatible;
		}
		case "verbose": {
			return TreeBeta.exportVerbose(tree) as JsonCompatible;
		}
		case "compressed": {
			return TreeBeta.exportCompressed(tree, {
				...options,
				oldestCompatibleClient: FluidClientVersion.v2_3,
			}) as JsonCompatible;
		}
		case "snapshot": {
			const idCompressor = createIdCompressor(); // TODO: get from tree?
			const file: File = {
				tree: TreeBeta.exportCompressed(tree, {
					oldestCompatibleClient: FluidClientVersion.v2_3,
					idCompressor,
				}),
				schema: extractPersistedSchema(List),
				idCompressor: idCompressor.serialize(true),
			};
			return file as JsonCompatible;
		}
		default: {
			console.log(`Invalid source format: ${parts.at(-2)}`);
			process.exit(1);
		}
	}
}

/**
 * Throw if handle.
 */
export function rejectHandles(key: string, value: unknown): unknown {
	if (isFluidHandle(value)) {
		throw new Error("Fluid handles are not supported");
	}
	return value;
}

const options: ForestOptions & ICodecOptions = { jsonValidator: typeboxValidator };

const File = Type.Object({
	tree: Type.Unsafe<JsonCompatible<IFluidHandle>>(),
	schema: Type.Unsafe<JsonCompatible>(),
	idCompressor: Type.Unsafe<SerializedIdCompressorWithOngoingSession>(),
});
type File = Static<typeof File>;
