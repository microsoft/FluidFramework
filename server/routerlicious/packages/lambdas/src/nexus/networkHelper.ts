/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";
import { getNetworkInformationFromIP } from "@fluidframework/server-services-client";

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
	const privateLinkEnable = tenantInfo?.customData?.accountLinkIds ? true : false;
	if (networkInfo.isPrivateLink) {
		return privateLinkEnable &&
			networkInfo.privateLinkId === tenantInfo?.customData?.accountLinkIds
			? { message: "This is a private link socket connection", shouldConnect: true }
			: { message: "private link should not connect", shouldConnect: false };
	} else {
		return privateLinkEnable
			? {
					message:
						"This is a failed private link tenant socket connection from public network",
					shouldConnect: false,
			  }
			: { message: "public should connect", shouldConnect: true };
	}
}
