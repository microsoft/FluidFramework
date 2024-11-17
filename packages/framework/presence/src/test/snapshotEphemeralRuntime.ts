/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "vitest";

import type { IEphemeralRuntime } from "../internalTypes.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";

/**
 * A mock runtime that checks that all submitted signals match snapshots.
 */
export class MockRuntimeSignalSnapshotter extends MockEphemeralRuntime {
	public readonly submittedSignals: Parameters<IEphemeralRuntime["submitSignal"]>[] = [];

	public override submitSignal: IEphemeralRuntime["submitSignal"] = (
		...args: Parameters<IEphemeralRuntime["submitSignal"]>
	) => {
		this.submittedSignals.push(args);
		expect(JSON.stringify(args, undefined, 2)).toMatchSnapshot("submitted signal");
	};

	public override assertAllSignalsSubmitted(): void {
		// do nothing
	}
}
