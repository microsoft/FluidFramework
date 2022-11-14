/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IClient } from "@fluidframework/protocol-definitions";

import { IFluidClientDebugger } from "@fluid-tools/client-debugger";

/**
 * Contains React hooks for shared use within the library.
 */

/**
 * React hook for getting the session user's client ID.
 *
 * @internal
 */
export function useMyClientId(clientDebugger: IFluidClientDebugger): string | undefined {
	const [myClientId, setMyClientId] = React.useState<string | undefined>(
		clientDebugger.getClientId(),
	);

	React.useEffect(() => {
		function onContainerConnectionChange(): void {
			setMyClientId(clientDebugger.getClientId());
		}

		clientDebugger.on("containerConnected", onContainerConnectionChange);
		clientDebugger.on("containerDisconnected", onContainerConnectionChange);

		return (): void => {
			clientDebugger.off("containerConnected", onContainerConnectionChange);
			clientDebugger.off("containerDisconnected", onContainerConnectionChange);
		};
	}, [clientDebugger, setMyClientId]);

	return myClientId;
}

/**
 * React hook for getting the current Audience of the session client.
 *
 * @internal
 */
export function useAudience(clientDebugger: IFluidClientDebugger): Map<string, IClient> {
	const [audience, setAudience] = React.useState<Map<string, IClient>>(
		clientDebugger.getAudienceMembers(),
	);

	React.useEffect(() => {
		function onAudienceMemberChange(): void {
			setAudience(clientDebugger.getAudienceMembers());
		}

		clientDebugger.on("audienceMemberChange", onAudienceMemberChange);

		return (): void => {
			clientDebugger.off("audienceMemberChange", onAudienceMemberChange);
		};
	}, [clientDebugger, setAudience]);

	return audience;
}

/**
 * React hook for getting the audience member data for the session client.
 *
 * @internal
 */
export function useMyClientConnection(clientDebugger: IFluidClientDebugger): IClient | undefined {
	const myClientId = useMyClientId(clientDebugger);
	const audience = useAudience(clientDebugger);

	return myClientId === undefined ? undefined : audience.get(myClientId);
}
