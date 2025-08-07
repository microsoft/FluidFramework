/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getNetworkInformationFromIP } from "@fluidframework/server-services-client";
import type * as core from "@fluidframework/server-services-core";

/**
 * Check the network information to determine if the socket should connect.
 *
 * @param tenantManager - The tenant manager to use to get the tenant information.
 * @param socket - The socket to check the network information for.
 * @returns A promise that resolves to an object containing a message and a boolean indicating if the socket should connect.
 */
export async function checkNetworkInformation(
	tenantManager: core.ITenantManager,
	socket: core.IWebSocket,
): Promise<{ message: string; shouldConnect: boolean }> {
	const tenantId = socket?.handshake?.query?.tenantId as string | undefined;
	const tenantInfo = await tenantManager.getTenantfromRiddler(tenantId);
	const clientIPAddress = socket.handshake.headers["x-forwarded-for"].split(",")[0] as
		| string
		| undefined;
	const networkInfo = getNetworkInformationFromIP(clientIPAddress);
	const privateLinkEnable = tenantInfo?.customData?.privateEndpoints?.accountLinkId
		? true
		: false;
	if (networkInfo.isPrivateLink) {
		if (privateLinkEnable) {
			const accountLinkId = tenantInfo?.customData?.privateEndpoints?.accountLinkId;
			return networkInfo.privateLinkId === accountLinkId
				? { message: "This is a private link socket connection", shouldConnect: true }
				: {
						message:
							"This private link should not be connected since the link id does not match",
						shouldConnect: false,
				  };
		} else {
			return {
				message:
					"This private link should not be connected since the tenant is not private link enabled",
				shouldConnect: false,
			};
		}
	} else {
		return privateLinkEnable
			? {
					message:
						"This is a failed private link tenant socket connection from public network",
					shouldConnect: false,
			  }
			: { message: "This public network should be connected", shouldConnect: true };
	}
}
