/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import type { IFluidDataStoreRuntime, Serializable } from "@fluidframework/datastore-definitions";

import { createEphemeralIndependentDirectory } from "../independentDirectory/independentDirectory";

import type { IndependentValueManager } from "../independentValueManager";
import type { IndependentDirectoryNode } from "../independentDirectory/types";

// ---- test (example) code ----

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const dirNode = {} as IndependentDirectoryNode<IndependentValueManager<{ x: number }>>;
declare function createLatestStateManager<T>(
	intitial: Serializable<T>,
): IndependentValueManager<Serializable<T>>;

const dirImplX = createEphemeralIndependentDirectory(
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	{} as IFluidDataStoreRuntime,
	{
		cursor: createLatestStateManager({ x: 0, y: 0 }),
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		camera: {} as IndependentValueManager<{ x: number; y: number; z: number }>,
	},
);
// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
const dirImpl: typeof dirImplX = dirImplX;
dirImpl.add("caret", createLatestStateManager({ id: "", pos: 0 }));
const fakeAdd = dirImpl.cursor.x + dirImpl.caret.pos;
console.log(dirImpl.curso.x); // error to highlight typo detection (proper typing in effect)

// // eslint-disable-next-line @typescript-eslint/ban-types
// type InitialIndependentDirectory = IndependentDirectoryMethods<{}>;

// const iDir: InitialIndependentDirectory = createEphemeralIndependentDirectoryFromClass({});
// iDir.add("cursor", dirNode);
// iDir.add("camera", dirNode);
// console.log(iDir.cursor.x);
