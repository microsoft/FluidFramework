/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import type { IFluidDataStoreRuntime, Serializable } from "@fluidframework/datastore-definitions";

// Proper clients use EphemeralIndependentDirectory from @fluid-experimental/ephemeral-independent
import { createEphemeralIndependentDirectory } from "../independentDirectory/independentDirectory.js";

import type { IndependentDatastoreHandle, IndependentValue, RoundTrippable } from "../index.js";

declare function createValueManager<T, Path extends string>(
	initial: Serializable<T>,
): (
	path: Path,
	datastoreHandle: IndependentDatastoreHandle<Path, T>,
) => { value: RoundTrippable<T>; manager: IndependentValue<RoundTrippable<T>> };

// ---- test (example) code ----

const dirImplX = createEphemeralIndependentDirectory(
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	{} as IFluidDataStoreRuntime,
	{
		cursor: createValueManager({ x: 0, y: 0 }),
		camera: () => ({
			value: { x: 0, y: 0, z: 0 },
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			manager: {} as IndependentValue<{ x: number; y: number; z: number }>,
		}),
	},
);
// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
const dirImpl: typeof dirImplX = dirImplX;

const initialCaret = { id: "", pos: 0 };
dirImpl.add("caret", createValueManager(initialCaret));

const fakeAdd = dirImpl.camera.z + dirImpl.cursor.x + dirImpl.caret.pos;

// @ts-expect-error should error on typo detection
console.log(dirImpl.curso.x); // error to highlight typo detection (proper typing in effect)

// example of second add at existing path - results in union of types (should throw at runtime)
dirImpl.add("caret", createValueManager({ dupe: 0 }));
