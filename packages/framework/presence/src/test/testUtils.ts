/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	InternalUtilityTypes,
	JsonDeserialized,
} from "@fluidframework/core-interfaces/internal";
import type { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { getUnexpectedLogErrorException } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers, SinonSpy } from "sinon";

import { createPresenceManager } from "../presenceManager.js";
import type { InboundClientJoinMessage, OutboundClientJoinMessage } from "../protocol.js";
import type { SystemWorkspaceDatastore } from "../systemWorkspace.js";
import type { AttendeeId } from "../presence.js";
import type { ClientConnectionId} from "../baseTypes.js";

import type { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";


/**
 * Use to compile-time assert types of two variables are identical.
 */
export function assertIdenticalTypes<T, U>(
	_actual: T & InternalUtilityTypes.IfSameType<T, U>,
	_expected: U & InternalUtilityTypes.IfSameType<T, U>,
): InternalUtilityTypes.IfSameType<T, U> {
	return undefined as InternalUtilityTypes.IfSameType<T, U>;
}

/**
 * Creates a non-viable (`undefined`) instance of type T to be used for type checking.
 */
export function createInstanceOf<T>(): T {
	return undefined as T;
}

type SpecificAttendeeId<T extends string> = string extends T
	? never
	: Exclude<T & AttendeeId, never>;

/**
 * Forms {@link AttendeeId} for a specific attendee
 */
export function createSpecificAttendeeId<const T extends string>(
	id: T,
): SpecificAttendeeId<T> {
	return id as SpecificAttendeeId<T>;
}

/**
 * Mock {@link AttendeeId}.
 */
export const attendeeId1 = createSpecificAttendeeId("attendeeId-1");
/**
 * Mock {@link AttendeeId}.
 */
export const attendeeId2 = createSpecificAttendeeId("attendeeId-2");
/**
 * Mock {@link ClientConnectionId}.
 *
 * @remarks
 * This is an {@link AttendeeId} as a workaround to TypeScript expectation
 * that specific properties overriding an indexed property still conform
 * to the index signature. This makes cases where it is used as
 * `clientConnectionId` key in {@link SystemWorkspaceDatastore} also
 * satisfy {@link GeneralDatastoreMessageContent}'s `AttendeeId` key.
 *
 * The only known alternative is to use
 * `satisfies SystemWorkspaceDatastore as SystemWorkspaceDatastore`
 * wherever "system:presence" is defined.
 */
export const connectionId2 = createSpecificAttendeeId("client2");

/**
 * Generates expected inbound join signal for a client that was initialized while connected.
 */
export function generateBasicClientJoin(
	fixedTime: number,
	{
		attendeeId = attendeeId2,
		clientConnectionId = connectionId2,
		updateProviders = ["client0", "client1", "client3"],
		connectionOrder = 0,
		averageLatency = 0,
		priorClientToSessionId = {},
	}: {
		attendeeId?: string;
		clientConnectionId?: ClientConnectionId;
		updateProviders?: string[];
		connectionOrder?: number;
		averageLatency?: number;
		priorClientToSessionId?: SystemWorkspaceDatastore["clientToSessionId"];
	},
): InboundClientJoinMessage {
	return {
		type: "Pres:ClientJoin",
		content: {
			"avgLatency": averageLatency,
			"data": {
				"system:presence": {
					"clientToSessionId": {
						...priorClientToSessionId,
						[clientConnectionId]: {
							"rev": connectionOrder,
							"timestamp": fixedTime,
							"value": attendeeId as AttendeeId,
						},
					},
				},
			},
			"sendTimestamp": fixedTime,
			updateProviders,
		},
		clientId: clientConnectionId,
	};
}

/**
 * Prepares an instance of presence as it would be if initialized while connected.
 *
 * @param runtime - the mock runtime
 * @param attendeeId - the client session id given to presence
 * @param clientConnectionId - the client connection id
 * @param clock - the fake timer.
 * @param logger - optional logger to track telemetry events
 */
export function prepareConnectedPresence(
	runtime: MockEphemeralRuntime,
	attendeeId: string,
	clientConnectionId: ClientConnectionId,
	clock: Omit<SinonFakeTimers, "restore">,
	logger?: EventAndErrorTrackingLogger,
): ReturnType<typeof createPresenceManager> {
	// Set runtime to connected state
	runtime.clientId = clientConnectionId;
	// TODO: runtime.connected has been hacked in past to lie about true connection.
	// This will need to be updated to an alternate status provider.
	runtime.connected = true;

	logger?.registerExpectedEvent({ eventName: "Presence:PresenceInstantiated" });

	// This logic needs to be kept in sync with datastore manager.
	const quorumClientIds = [...runtime.quorum.getMembers().keys()].filter(
		(quorumClientId) => quorumClientId !== clientConnectionId,
	);
	if (quorumClientIds.length > 3) {
		quorumClientIds.length = 3;
	}

	const expectedClientJoin: OutboundClientJoinMessage &
		Partial<Pick<InboundClientJoinMessage, "clientId">> = generateBasicClientJoin(clock.now, {
		attendeeId,
		clientConnectionId,
		updateProviders: quorumClientIds,
	});
	delete expectedClientJoin.clientId;
	runtime.signalsExpected.push([expectedClientJoin]);

	const presence = createPresenceManager(runtime, attendeeId as AttendeeId);

	// Validate expectations post initialization to make sure logger
	// and runtime are left in a clean expectation state.
	const logErrors = getUnexpectedLogErrorException(logger);
	if (logErrors) {
		throw logErrors;
	}
	runtime.assertAllSignalsSubmitted();

	// Pass a little time (to mimic reality)
	clock.tick(10);

	// Return the join signal
	presence.processSignal([], { ...expectedClientJoin, clientId: clientConnectionId }, true);

	return presence;
}

/**
 * Asserts that all expected telemetry and signals were sent.
 */
export function assertFinalExpectations(
	runtime: MockEphemeralRuntime,
	logger?: EventAndErrorTrackingLogger,
): void {
	// Make sure all expected events were logged and there are no unexpected errors.
	const logErrors = getUnexpectedLogErrorException(logger);
	if (logErrors) {
		throw logErrors;
	}
	// Make sure all expected signals were sent.
	runtime.assertAllSignalsSubmitted();
}

/**
 * Creates a null validator (one that does nothing) for a given type T.
 */
export function createNullValidator<T extends object>(): StateSchemaValidator<T> {
	const nullValidator: StateSchemaValidator<T> = (data: unknown) => {
		return data as JsonDeserialized<T>;
	};
	return nullValidator;
}

/**
 * A validator function spy.
 */
export type ValidatorSpy = Pick<SinonSpy, "callCount">;

/**
 * Creates a validator and a spy for test purposes.
 */
export function createSpiedValidator<T extends object>(
	validator: StateSchemaValidator<T>,
): [StateSchemaValidator<T>, ValidatorSpy] {
	const spy: ValidatorSpy = {
		callCount: 0,
	};

	const nullValidatorSpy: StateSchemaValidator<T> = (data: unknown) => {
		spy.callCount++;
		return validator(data) as JsonDeserialized<T>;
	};
	return [nullValidatorSpy, spy];
}
