/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, expect } from "vitest";

import type { IEphemeralRuntime } from "../internalTypes.js";
import type { PresenceStatesSchema, PresenceWorkspaceAddress } from "../types.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";

type Signal = Parameters<IEphemeralRuntime["submitSignal"]>;

/**
 * A mock runtime that checks that all submitted signals match snapshots.
 */
export class MockRuntimeSignalSnapshotter extends MockEphemeralRuntime {
	public readonly submittedSignals: Signal[] = [];

	public constructor(
		logger?: ITelemetryBaseLogger,
		/**
		 * If true, all signals sent to through the runtime will be snapshotted automatically.
		 */
		public snapshotSignals = false,
	) {
		super(logger);
	}

	public override submitSignal: IEphemeralRuntime["submitSignal"] = (...args: Signal) => {
		this.submittedSignals.push(args);
		if (this.snapshotSignals) {
			expect(JSON.stringify(args, undefined, 2)).toMatchSnapshot("submitted signal");
		}
	};

	public override assertAllSignalsSubmitted(): void {
		// do nothing
	}
}

/**
 * Get presence workspace data from a signal.
 *
 * @param signal - A signal to extract data from.
 * @param workspaceAddress - The workspace address for the presence workspace.
 * @param valueKey - The key of the value manager.
 * @param sessionId - An optional session ID. If provided, then the returned data will only contain the _value_ of the
 * value manager.
 * @returns A subset of the signal based on the parameters.
 *
 * @internal
 */
export function getDataFromSignal(
	signal: Signal,
	workspaceAddress: PresenceWorkspaceAddress,
	valueKey: string,
	sessionId?: string,
	property?: "value" | "rev" | "timestamp",
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
	const content = (signal?.[1] as any).data as PresenceStatesSchema;

	const workspace = content[workspaceAddress];

	assert(workspace !== undefined);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
	const workspaceData = (workspace as any)[valueKey];

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return sessionId === undefined
		? workspaceData
		: property === undefined
			? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				workspaceData[sessionId]
			: // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				workspaceData[sessionId][property];
}

/**
 * Extracts a presence workspace from a signal.
 */
export function getPresenceWorkspaceFromSignal(
	signal: Signal,
	workspaceAddress: PresenceWorkspaceAddress,
): object {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
	const content = (signal?.[1] as any).data as PresenceStatesSchema;

	const workspace = content[workspaceAddress];

	assert(workspace !== undefined);
	return workspace;
}
