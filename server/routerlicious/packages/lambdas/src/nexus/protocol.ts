/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import { IClient, IClientDetails, IConnect, IUser } from "@fluidframework/protocol-definitions";
import * as semver from "semver";

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
		"capabilities" in details &&
		typeof details.capabilities === "object" &&
		details.capabilities !== null &&
		"interactive" in details.capabilities &&
		typeof details.capabilities.interactive === "boolean" &&
		"type" in details &&
		(typeof details.type === "string" || details.type === undefined) &&
		"environment" in details &&
		(typeof details.environment === "string" || details.environment === undefined) &&
		"device" in details &&
		(typeof details.device === "string" || details.device === undefined)
	);
}

function isValidUser(user: unknown): user is IUser {
	return typeof user === "object" && user !== null && "id" in user && typeof user.id === "string";
}

function isValidClient(client: unknown): client is IClient {
	return (
		typeof client === "object" &&
		client !== null &&
		"mode" in client &&
		(client.mode === "write" || client.mode === "read") &&
		"details" in client &&
		isValidClientDetails(client.details) &&
		"permission" in client &&
		Array.isArray(client.permission) &&
		client.permission.every((p) => typeof p === "string") &&
		"user" in client &&
		isValidUser(client.user) &&
		"scopes" in client &&
		Array.isArray(client.scopes) &&
		client.scopes.every((s) => typeof s === "string") &&
		"timestamp" in client &&
		(typeof client.timestamp === "number" || client.timestamp === undefined)
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
		"tenantId" in message &&
		typeof message.tenantId === "string" &&
		"id" in message &&
		typeof message.id === "string" &&
		"token" in message &&
		// According to protocol definitions, this can be string or null, but is
		// expected to eventually be string or undefined.
		(typeof message.token === "string" ||
			message.token === null ||
			message.token === undefined) &&
		"client" in message &&
		isValidClient(message.client) &&
		"versions" in message &&
		Array.isArray(message.versions) &&
		message.versions.every((v) => typeof v === "string") &&
		"driverVersion" in message &&
		(typeof message.driverVersion === "string" || message.driverVersion === undefined) &&
		"mode" in message &&
		(message.mode === "write" || message.mode === "read") &&
		"nonce" in message &&
		(typeof message.nonce === "string" || message.nonce === undefined) &&
		"epoch" in message &&
		(typeof message.epoch === "string" || message.epoch === undefined) &&
		"supportedFeatures" in message &&
		(typeof message.supportedFeatures === "object" ||
			message.supportedFeatures === undefined) &&
		"relayUserAgent" in message &&
		(typeof message.relayUserAgent === "string" || message.relayUserAgent === undefined)
	);
}
