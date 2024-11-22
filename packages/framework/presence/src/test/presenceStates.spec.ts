/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IPresence } from "../presence.js";

import { addControlsTests } from "./broadcastControlsTests.js";

import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/presence/internal/core-interfaces";
import type { InternalTypes } from "@fluidframework/presence/internal/exposedInternalTypes";

describe("Presence", () => {
	describe("PresenceStates", () => {
		/**
		 * See {@link checkCompiles} below
		 */
		it("API use compiles", () => {});

		addControlsTests((presence, controlSettings) => {
			return presence.getStates("name:testWorkspaceA", {}, controlSettings);
		});
	});
});

declare function createValueManager<T, Key extends string>(
	initial: JsonSerializable<T> & JsonDeserialized<T>,
): { instanceBase: new () => unknown } & ((
	key: Key,
	datastoreHandle: InternalTypes.StateDatastoreHandle<
		Key,
		InternalTypes.ValueRequiredState<T>
	>,
) => {
	value: InternalTypes.ValueRequiredState<T>;
	manager: InternalTypes.StateValue<JsonDeserialized<T>>;
});

// ---- test (example) code ----

/**
 * Check that the code compiles.
 */
export function checkCompiles(): void {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const presence = {} as IPresence;
	const statesWorkspace = presence.getStates("name:testWorkspaceA", {
		cursor: createValueManager({ x: 0, y: 0 }),
		// eslint-disable-next-line prefer-object-spread
		camera: Object.assign({ instanceBase: undefined as unknown as new () => unknown }, () => ({
			value: { rev: 0, timestamp: Date.now(), value: { x: 0, y: 0, z: 0 } },
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			manager: {} as InternalTypes.StateValue<{ x: number; y: number; z: number }>,
		})),
	});
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const states: typeof statesWorkspace = statesWorkspace;

	const initialCaret = { id: "", pos: 0 };
	states.add("caret", createValueManager(initialCaret));
	const statesProps = states.props;

	const fakeAdd = statesProps.camera.z + statesProps.cursor.x + statesProps.caret.pos;
	console.log(fakeAdd);

	// @ts-expect-error should error on typo detection
	console.log(states.curso); // error to highlight typo detection (proper typing in effect)

	// example of second add at existing key - results in union of types (should throw at runtime)
	states.add("caret", createValueManager({ dupe: 0 }));

	states.add(
		"undefined",
		// @ts-expect-error should error non-optional undefined
		createValueManager({ undef: undefined }),
	);

	states.add(
		"undefOrNum",
		// @ts-expect-error should error on non-optional that may be undefined
		createValueManager<{ undefOrNum: undefined | number }, "undefOrNum">({ undefOrNum: 4 }),
	);

	// optional undefined is ok - though not recommended to actually specify such properties with
	// undefined values as the properties won't come back; they will be absent.
	states.add(
		"optionalUndefined",
		// @ts-expect-error should error on exact optional property
		createValueManager<{ undef?: number }, "optionalUndefined">({ undef: undefined }),
	);
	states.add(
		"optionalUndefinedPreferred",
		createValueManager<{ undef?: number }, "optionalUndefinedPreferred">({}),
	);
}
