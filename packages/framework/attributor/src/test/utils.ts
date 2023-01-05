/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IClient } from "@fluidframework/protocol-definitions";
import { IAudience } from "@fluidframework/container-definitions";

export function makeMockAudience(clientIds: string[]): IAudience {
	const clients = new Map<string, IClient>();
	clientIds.forEach((clientId, index) => {
		const stringId = String.fromCharCode(index + 65);
		const name = stringId.repeat(10);
		const userId = `${name}@microsoft.com`;
		const email = userId;
		const user = {
			id: userId,
			name,
			email,
		};
		clients.set(clientId, {
			mode: "write",
			details: { capabilities: { interactive: true } },
			permission: [],
			user,
			scopes: [],
		});
	});
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return {
		getMember: (clientId: string): IClient | undefined => {
			return clients.get(clientId);
		},
	} as IAudience;
}
