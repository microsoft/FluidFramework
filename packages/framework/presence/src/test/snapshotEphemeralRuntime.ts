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

	/**
	 * If true, all signals sent to through the runtime will be snapshotted automatically.
	 */
	public snapshotSignals = false;

	public override submitSignal: IEphemeralRuntime["submitSignal"] = (
		...args: Parameters<IEphemeralRuntime["submitSignal"]>
	) => {
		this.submittedSignals.push(args);
		if (this.snapshotSignals) {
			expect(JSON.stringify(args, undefined, 2)).toMatchSnapshot("submitted signal");
		}
	};

	public override assertAllSignalsSubmitted(): void {
		// do nothing
	}
}
