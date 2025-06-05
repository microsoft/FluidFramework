/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import { IClient, IClientDetails, IConnect, IUser } from "@fluidframework/protocol-definitions";
import * as semver from "semver";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export const ProtocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

function selectProtocolVersion(connectVersions: string[]): string | undefined {
	for (const connectVersion of connectVersions) {
		for (const protocolVersion of ProtocolVersions) {
			if (semver.intersects(protocolVersion, connectVersion)) {
				return protocolVersion;
			}
		}
	}
	return undefined;
}

export function checkProtocolVersion(versions: string[]): [string[], string] {
	// Iterate over the version ranges provided by the client and select the best one that works
	const connectVersions = versions || ["^0.1.0"];
	const version = selectProtocolVersion(connectVersions);
	if (!version) {
		Lumberjack.error(`Unsupported client protocol.`, {
			server: ProtocolVersions,
			client: connectVersions,
		});
		throw new NetworkError(
			400,
			`Unsupported client protocol. Server: ${ProtocolVersions}. Client: ${connectVersions}`,
		);
	}
	return [connectVersions, version];
}

function isValidClientDetails(details: unknown): details is IClientDetails {
	return (
		typeof details === "object" &&
		details !== null &&
		typeof (details as IClientDetails).capabilities === "object" &&
		(details as IClientDetails).capabilities !== null &&
		typeof (details as IClientDetails).capabilities.interactive === "boolean" &&
		(typeof (details as IClientDetails).type === "string" ||
			(details as IClientDetails).type === undefined) &&
		(typeof (details as IClientDetails).environment === "string" ||
			(details as IClientDetails).environment === undefined) &&
		(typeof (details as IClientDetails).device === "string" ||
			(details as IClientDetails).device === undefined)
	);
}

function isValidUser(user: unknown): user is IUser {
	return typeof user === "object" && user !== null && "id" in user && typeof user.id === "string";
}

function isValidClient(client: unknown): client is IClient {
	return (
		typeof client === "object" &&
		client !== null &&
		((client as IClient).mode === "write" || (client as IClient).mode === "read") &&
		isValidClientDetails((client as IClient).details) &&
		Array.isArray((client as IClient).permission) &&
		(client as IClient).permission.every((p) => typeof p === "string") &&
		isValidUser((client as IClient).user) &&
		Array.isArray((client as IClient).scopes) &&
		(client as IClient).scopes.every((s) => typeof s === "string") &&
		(typeof (client as IClient).timestamp === "number" ||
			(client as IClient).timestamp === undefined)
	);
}

/**
 * Assert that the given message is a valid connect_document message from a client.
 *
 * @internal
 */
export function isValidConnectionMessage(message: unknown): message is IConnect {
	return (
		typeof message === "object" &&
		message !== null &&
		typeof (message as IConnect).tenantId === "string" &&
		typeof (message as IConnect).id === "string" &&
		// According to protocol definitions, this can be string or null, but is
		// expected to eventually be string or undefined.
		(typeof (message as IConnect).token === "string" ||
			(message as IConnect).token === null ||
			(message as IConnect).token === undefined) &&
		isValidClient((message as IConnect).client) &&
		Array.isArray((message as IConnect).versions) &&
		(message as IConnect).versions.every((v) => typeof v === "string") &&
		(typeof (message as IConnect).driverVersion === "string" ||
			(message as IConnect).driverVersion === undefined) &&
		((message as IConnect).mode === "write" || (message as IConnect).mode === "read") &&
		(typeof (message as IConnect).nonce === "string" ||
			(message as IConnect).nonce === undefined) &&
		(typeof (message as IConnect).epoch === "string" ||
			(message as IConnect).epoch === undefined) &&
		(typeof (message as IConnect).supportedFeatures === "object" ||
			(message as IConnect).supportedFeatures === undefined) &&
		(typeof (message as IConnect).relayUserAgent === "string" ||
			(message as IConnect).relayUserAgent === undefined)
	);
}
