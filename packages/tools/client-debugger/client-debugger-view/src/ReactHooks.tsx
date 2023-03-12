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
	const { container } = clientDebugger;
	const [myClientId, setMyClientId] = React.useState<string | undefined>(container.clientId);

	React.useEffect(() => {
		function onContainerConnectionChange(): void {
			setMyClientId(container.clientId);
		}

		container.on("connected", onContainerConnectionChange);
		container.on("disconnected", onContainerConnectionChange);

		return (): void => {
			container.off("connected", onContainerConnectionChange);
			container.off("disconnected", onContainerConnectionChange);
		};
	}, [container, setMyClientId]);

	return myClientId;
}

/**
 * React hook for getting the current Audience of the session client.
 *
 * @internal
 */
export function useAudience(clientDebugger: IFluidClientDebugger): Map<string, IClient> {
	const { audience } = clientDebugger;
	const [audienceData, setAudienceData] = React.useState<Map<string, IClient>>(
		audience.getMembers(),
	);

	React.useEffect(() => {
		function onAudienceMemberChange(): void {
			setAudienceData(audience.getMembers());
		}

		audience.on("addMember", onAudienceMemberChange);
		audience.on("removeMember", onAudienceMemberChange);

		return (): void => {
			audience.off("addMember", onAudienceMemberChange);
			audience.off("removeMember", onAudienceMemberChange);
		};
	}, [audience, setAudienceData]);

	return audienceData;
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
