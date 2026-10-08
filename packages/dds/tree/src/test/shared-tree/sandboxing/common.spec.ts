/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	extractLogSafeErrorProperties,
	MockLogger,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils/internal";

import { SandboxFailureCode, SandboxProtocolError } from "../../../sandboxing/index.js";

describe("Sandbox common utilities", () => {
	describe("SandboxProtocolError", () => {
		it("maps a constructed protocol error to telemetry with its fixed name and tags", () => {
			const sensitiveMessage = "Private document contents";
			const cause = new Error("Cause Message");
			const error = new SandboxProtocolError("Invalid Guest data.", {
				cause,
				telemetryProperties: {
					receivedData: {
						value: sensitiveMessage,
						tag: TelemetryDataTag.UserData,
					},
					guestData: {
						value: "Guest-controlled value",
						tag: TelemetryDataTag.SandboxGuestData,
					},
					expectedCount: 1,
				},
			});

			assert.equal(error.name, "SandboxProtocolError");
			assert.equal(error.cause, cause);
			const expectedStack = extractLogSafeErrorProperties(
				error,
				true /* sanitizeStack */,
			).stack;
			const logger = new MockLogger();
			logger.toTelemetryLogger().sendErrorEvent({ eventName: "ProtocolFailure" }, error);
			assert.deepEqual(logger.events, [
				{
					category: "error",
					eventName: "ProtocolFailure",
					error: "Invalid Guest data.",
					stack: expectedStack,
					receivedData: {
						value: sensitiveMessage,
						tag: TelemetryDataTag.UserData,
					},
					guestData: {
						value: "Guest-controlled value",
						tag: TelemetryDataTag.SandboxGuestData,
					},
					expectedCount: 1,
					name: "SandboxProtocolError",
					message: "Invalid Guest data.",
					errorInstanceId: error.errorInstanceId,
					errorType: undefined,
				},
			]);
		});

		describe("fromPeerMessage", () => {
			it("looks up peer failure codes locally without using either diagnostic as the error message", () => {
				const protocolMessage = "Received 2, expected 1.";
				const sensitiveMessage = "Private schema identifier";
				for (const peer of ["Host", "Guest"] as const) {
					const error = SandboxProtocolError.fromPeerMessage(
						{
							code: SandboxFailureCode.ProcessingFailure,
							protocolMessage,
							sensitiveMessage,
						},
						peer,
					);
					assert.equal(
						error.message,
						`The ${peer} reported a sandbox session failure. Sandbox processing failed.`,
					);
					const properties = error.getTelemetryProperties();
					assert.equal(
						properties[peer === "Guest" ? "fromGuestCode" : "fromHostCode"],
						SandboxFailureCode.ProcessingFailure,
					);
					assert.deepEqual(
						properties[peer === "Guest" ? "fromGuestSensitive" : "fromHostSensitive"],
						{
							value: sensitiveMessage,
							tag: TelemetryDataTag.UserData,
						},
					);
					if (peer === "Guest") {
						assert.deepEqual(properties.fromGuest, {
							value: protocolMessage,
							tag: TelemetryDataTag.SandboxGuestData,
						});
					} else {
						assert.equal(properties.fromHost, protocolMessage);
					}
				}
			});

			it("creates peer failure telemetry with independent optional fields and a fixed error name", () => {
				const protocolMessage = "Received 2, expected 1.";
				const sensitiveMessage = "Private document contents";
				for (const peer of ["Host", "Guest"] as const) {
					for (const diagnostics of [
						{},
						{ protocolMessage },
						{ sensitiveMessage },
						{ protocolMessage, sensitiveMessage },
						{ protocolMessage: "", sensitiveMessage: "" },
					]) {
						const error = SandboxProtocolError.fromPeerMessage(
							{
								code: SandboxFailureCode.ProcessingFailure,
								...diagnostics,
							},
							peer,
						);
						const logger = new MockLogger();
						logger.toTelemetryLogger().sendErrorEvent({ eventName: "GuestFailure" }, error);
						const [event] = logger.events;
						assert(event !== undefined);
						assert.equal(event.name, "SandboxProtocolError");
						assert.equal(
							event.error,
							`The ${peer} reported a sandbox session failure. Sandbox processing failed.`,
						);
						assert.equal(
							event[peer === "Guest" ? "fromGuestCode" : "fromHostCode"],
							SandboxFailureCode.ProcessingFailure,
						);
						assert.deepEqual(
							event[peer === "Guest" ? "fromGuest" : "fromHost"],
							diagnostics.protocolMessage === undefined
								? undefined
								: peer === "Host"
									? diagnostics.protocolMessage
									: {
											value: diagnostics.protocolMessage,
											tag: TelemetryDataTag.SandboxGuestData,
										},
						);
						assert.deepEqual(
							event[peer === "Guest" ? "fromGuestSensitive" : "fromHostSensitive"],
							diagnostics.sensitiveMessage === undefined
								? undefined
								: {
										value: diagnostics.sensitiveMessage,
										tag: TelemetryDataTag.UserData,
									},
						);
					}
				}
			});
		});
	});
});
