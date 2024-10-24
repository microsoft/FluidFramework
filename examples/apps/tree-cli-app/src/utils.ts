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
import { TreeArrayNode, type InsertableTypedNode } from "@fluidframework/tree";
import {
	extractPersistedSchema,
	FluidClientVersion,
	independentInitializedView,
	typeboxValidator,
	type ForestOptions,
	type ICodecOptions,
	type JsonCompatible,
	type VerboseTree,
	type ViewContent,
	type ConciseTree,
	TreeAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/alpha";
import { type Static, Type } from "@sinclair/typebox";

import type { Item } from "./schema.js";
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
			return TreeAlpha.importConcise(List, fileData as ConciseTree);
		}
		case "verbose": {
			return TreeAlpha.importVerbose(List, fileData as VerboseTree);
		}
		case "verbose-stored": {
			return TreeAlpha.importVerbose(List, fileData as VerboseTree, {
				useStoredKeys: true,
			});
		}
		case "compressed": {
			return TreeAlpha.importCompressed(List, fileData, { jsonValidator: typeboxValidator });
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
			return TreeAlpha.exportConcise(tree) as JsonCompatible;
		}
		case "verbose": {
			return TreeAlpha.exportVerbose(tree) as JsonCompatible;
		}
		case "concise-stored": {
			return TreeAlpha.exportConcise(tree, { useStoredKeys: true }) as JsonCompatible;
		}
		case "verbose-stored": {
			return TreeAlpha.exportVerbose(tree, { useStoredKeys: true }) as JsonCompatible;
		}
		case "compressed": {
			return TreeAlpha.exportCompressed(tree, {
				...options,
				oldestCompatibleClient: FluidClientVersion.v2_3,
			}) as JsonCompatible;
		}
		case "snapshot": {
			const idCompressor = createIdCompressor(); // TODO: get from tree?
			const file: File = {
				tree: TreeAlpha.exportCompressed(tree, {
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
 * Encode to format based on file name.
 */
export function applyEdit(edits: string, tree: List): void {
	for (const edit of edits.split(",")) {
		console.log(`Applying edit ${edit}`);
		const parts = edit.split(":");
		if (parts.length !== 2) {
			throw new Error(`Invalid edit ${edit}`);
		}
		const [kind, countString] = parts;
		const count = Number(countString);
		if (count === 0 || !Number.isInteger(count)) {
			throw new TypeError(`Invalid count in edit ${edit}`);
		}
		if (count > 0) {
			let data: InsertableTypedNode<typeof Item> | string;
			switch (kind) {
				case "string": {
					data = "x";
					break;
				}
				case "item": {
					data = { position: { x: 0, y: 0 }, name: "item" };
					break;
				}
				default: {
					throw new TypeError(`Invalid kind in insert edit ${edit}`);
				}
			}
			// eslint-disable-next-line unicorn/no-new-array
			tree.insertAtEnd(TreeArrayNode.spread(new Array(count).fill(data)));
		} else {
			switch (kind) {
				case "start": {
					tree.removeRange(0, -count);
					break;
				}
				case "end": {
					tree.removeRange(tree.length + count, -count);
					break;
				}
				default: {
					throw new TypeError(`Invalid end in remove edit ${edit}`);
				}
			}
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
