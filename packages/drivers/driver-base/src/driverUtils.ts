/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

/**
 * Extract and return the w3c data.
 * @param url - request url for which w3c data needs to be reported.
 * @param initiatorType - type of the network call
 * @internal
 */
export function getW3CData(url: string, initiatorType: string) {
	// From: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming
	// fetchStart: immediately before the browser starts to fetch the resource.
	// requestStart: immediately before the browser starts requesting the resource from the server
	// responseStart: immediately after the browser receives the first byte of the response from the server.
	// responseEnd: immediately after the browser receives the last byte of the resource
	//              or immediately before the transport connection is closed, whichever comes first.
	// secureConnectionStart: immediately before the browser starts the handshake process to secure the
	//              current connection. If a secure connection is not used, this property returns zero.
	// startTime: Time when the resource fetch started. This value is equivalent to fetchStart.
	// domainLookupStart: immediately before the browser starts the domain name lookup for the resource.
	// domainLookupEnd: immediately after the browser finishes the domain name lookup for the resource.
	// redirectStart: start time of the fetch which that initiates the redirect.
	// redirectEnd: immediately after receiving the last byte of the response of the last redirect.

	// Interval between start and finish of the domain name lookup for the resource.
	let dnsLookupTime: number | undefined; // domainLookupEnd - domainLookupStart
	// Interval between the first fetch until the last byte of the last redirect.
	let redirectTime: number | undefined; // redirectEnd - redirectStart
	// Time to establish the connection to the server to retrieve the resource.
	let tcpHandshakeTime: number | undefined; // connectEnd  - connectStart
	// Time from the end of the connection until the inital handshake process to secure the connection.
	// If 0, then no time is spent here.
	let secureConnectionTime: number | undefined; // connectEnd  - secureConnectionStart
	// Interval to receive all (first to last) bytes form the server.
	let responseNetworkTime: number | undefined; // responsEnd - responseStart
	// Interval between the initial fetch until the last byte is received.
	// Likely same as fetchTime + receiveContentTime.
	let fetchStartToResponseEndTime: number | undefined; // responseEnd  - fetchStart
	// reqStartToResponseEndTime = fetchStartToResponseEndTime - <initial TCP handshake>
	// Interval between starting the request for the resource until receiving the last byte.
	let reqStartToResponseEndTime: number | undefined; // responseEnd - requestStart
	let w3cStartTime: number | undefined; // W3C Start time = fetchStart time

	// getEntriesByType is only available in browser performance object
	const resources1 = globalThis.performance.getEntriesByType?.("resource") ?? [];
	// Usually the latest fetch call is to the end of resources, so we start from the end.
	for (let i = resources1.length - 1; i > 0; i--) {
		const indResTime = resources1[i] as PerformanceResourceTiming;
		const resource_name = indResTime.name.toString();
		const resource_initiatortype = indResTime.initiatorType;
		if (
			resource_initiatortype.localeCompare(initiatorType) === 0 &&
			resource_name.includes(url)
		) {
			redirectTime = indResTime.redirectEnd - indResTime.redirectStart;
			w3cStartTime = indResTime.fetchStart;
			dnsLookupTime = indResTime.domainLookupEnd - indResTime.domainLookupStart;
			tcpHandshakeTime = indResTime.connectEnd - indResTime.connectStart;
			secureConnectionTime =
				indResTime.secureConnectionStart > 0
					? indResTime.connectEnd - indResTime.secureConnectionStart
					: 0;
			responseNetworkTime =
				indResTime.responseStart > 0
					? indResTime.responseEnd - indResTime.responseStart
					: undefined;
			fetchStartToResponseEndTime =
				indResTime.fetchStart > 0 ? indResTime.responseEnd - indResTime.fetchStart : undefined;
			reqStartToResponseEndTime =
				indResTime.requestStart > 0
					? indResTime.responseEnd - indResTime.requestStart
					: undefined;
			break;
		}
	}
	return {
		dnsLookupTime,
		w3cStartTime,
		redirectTime,
		tcpHandshakeTime,
		secureConnectionTime,
		responseNetworkTime,
		fetchStartToResponseEndTime,
		reqStartToResponseEndTime,
	};
}

/**
 * An implementation of Promise.race that gives you the winner of the promise race.
 * If one of the promises is rejected before any other is resolved, this method will return the error/reason from that rejection.
 * @internal
 */
export async function promiseRaceWithWinner<T>(
	promises: Promise<T>[],
): Promise<{ index: number; value: T }> {
	return new Promise((resolve, reject) => {
		promises.forEach((p, index) => {
			p.then((v) => resolve({ index, value: v })).catch(reject);
		});
	});
}

/**
 * @internal
 */
export function validateMessages(
	reason: string,
	messages: ISequencedDocumentMessage[],
	from: number,
	logger: ITelemetryLoggerExt,
	strict: boolean = true,
) {
	if (messages.length !== 0) {
		const start = messages[0].sequenceNumber;
		const length = messages.length;
		const last = messages[length - 1].sequenceNumber;
		if (last + 1 !== from + length) {
			// If not strict, then return the first consecutive sub-block. If strict or start
			// seq number is not what we expected, then return no ops.
			if (strict || from !== start) {
				messages.length = 0;
			} else {
				let validOpsCount = 1;
				while (
					validOpsCount < messages.length &&
					messages[validOpsCount].sequenceNumber ===
						messages[validOpsCount - 1].sequenceNumber + 1
				) {
					validOpsCount++;
				}
				messages.length = validOpsCount;
			}
			logger.sendErrorEvent({
				eventName: "OpsFetchViolation",
				reason,
				from,
				start,
				last,
				length,
				details: JSON.stringify({
					validLength: messages.length,
					lastValidOpSeqNumber:
						messages.length > 0 ? messages[messages.length - 1].sequenceNumber : undefined,
					strict,
				}),
			});
		}
	}
}
