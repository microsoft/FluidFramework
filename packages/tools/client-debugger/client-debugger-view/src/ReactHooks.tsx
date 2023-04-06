/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IClient } from "@fluidframework/protocol-definitions";

import { IContainerDevtools } from "@fluid-tools/client-debugger";

/**
 * Contains React hooks for shared use within the library.
 */

/**
 * React hook for getting the session user's client ID.
 *
 * @internal
 */
export function useMyClientId(containerDevtools: IContainerDevtools): string | undefined {
	const { container } = containerDevtools;
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
export function useAudience(containerDevtools: IContainerDevtools): Map<string, IClient> {
	const { audience } = containerDevtools;
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
export function useMyClientConnection(containerDevtools: IContainerDevtools): IClient | undefined {
	const myClientId = useMyClientId(containerDevtools);
	const audience = useAudience(containerDevtools);

	return myClientId === undefined ? undefined : audience.get(myClientId);
}
