/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import {
	SchemaFactory,
	TreeBeta,
	// type InsertableTypedNode,
	type JsonCompatible,
	type VerboseTree,
	extractPersistedSchema,
	FluidClientVersion,
} from "../index.js";
import { readFileSync, writeFileSync } from "node:fs";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";

console.log("App");

const schemaBuilder = new SchemaFactory("com.fluidframework.example.cli");
class List extends schemaBuilder.array("List", schemaBuilder.string) {}

const path = "list.json";

const data: JsonCompatible = JSON.parse(readFileSync(path).toString());

// const node = TreeBeta.create(List, data as InsertableTypedNode<typeof List>);
const node = TreeBeta.createFromVerbose(List, data as VerboseTree);

node.insertAtEnd("x");

writeFileSync(path, JSON.stringify(TreeBeta.cloneToVerbose(node)));

// Demo all formats:
writeFileSync("list.verbose.json", JSON.stringify(TreeBeta.cloneToVerbose(node)));
// writeFileSync("list.simple.json", JSON.stringify(TreeBeta.cloneToJson(node)));
writeFileSync(
	"list.compressed.json",
	JSON.stringify(
		TreeBeta.cloneToCompressed(node, { oldestCompatibleClient: FluidClientVersion.v2_3 }),
	),
);

// Combo

const File = Type.Object({
	tree: Type.Unsafe<JsonCompatible<IFluidHandle>>(),
	schema: Type.Unsafe<JsonCompatible>(),
	idCompressor: Type.Unsafe<JsonCompatible>(),
});
type File = Static<typeof File>;

const idCompressor = createIdCompressor();
// idCompressor.finalizeCreationRange(idCompressor.takeUnfinalizedCreationRange());

const file: File = {
	tree: TreeBeta.cloneToCompressed(node, {
		oldestCompatibleClient: FluidClientVersion.v2_3,
		idCompressor,
	}),
	schema: extractPersistedSchema(List),
	idCompressor: idCompressor.serialize(true),
};

function rejectHandles(key: string, value: unknown): unknown {
	if (isFluidHandle(value)) {
		throw new Error("Fluid handles are not supported");
	}
	return value;
}

writeFileSync("list.combo.json", JSON.stringify(file, rejectHandles));
