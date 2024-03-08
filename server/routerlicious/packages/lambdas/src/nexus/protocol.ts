/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
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

export function checkVersion(versions: string[]): [string[], string] {
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
