/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AudienceClientMetadata } from "@fluidframework/devtools-core/internal";
import type { IClient } from "@fluidframework/driver-definitions";

/**
 * Represents a single audience user, aggregating their client connections.
 */
export interface AudienceMember {
	/**
	 * An ID for the user, unique among each individual user connecting to the session.
	 */
	userId: string;

	/**
	 * The set of client connections associated with the user.
	 */
	clients: Map<string, IClient>;
}

/**
 * Converts the provided audience data from the Container into a form used by the visualizers.
 * Combines multiple member instances for the same user, and enumerates their separate client connections.
 */
export function combineMembersWithMultipleConnections(
	audienceMetadata: AudienceClientMetadata[],
): Map<string, AudienceMember> {
	const audienceMembers = new Map<string, AudienceMember>();

	for (const audienceEntry of audienceMetadata) {
		const clientId = audienceEntry.clientId;
		const userId = audienceEntry.client.user.id;

		// Ensure we're tracking the user
		let audienceMember = audienceMembers.get(userId);
		if (audienceMember === undefined) {
			audienceMember = {
				userId,
				clients: new Map<string, IClient>(),
			};
			audienceMembers.set(userId, audienceMember);
		}

		// Add this connection to their collection
		audienceMember.clients.set(clientId, audienceEntry.client);
	}
	return audienceMembers;
}
