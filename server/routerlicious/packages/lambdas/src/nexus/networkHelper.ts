/* eslint-disable unicorn/prefer-ternary */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";
import {
	getNetworkInformationFromIP,
} from "@fluidframework/server-services-client";

// eslint-disable-next-line jsdoc/require-description
/**
 * @returns NetworkInformation
 */
export async function checkNetworkInformation(
	tenantManager: core.ITenantManager,
	socket: core.IWebSocket
): Promise<{ message: string, shouldConnect: boolean }> {
	const tenantId = socket?.handshake?.query?.tenantId as string | undefined;
	const tennatInfo = await tenantManager.getTenantfromRiddler(tenantId);
	const clientIPAddress = socket?.handshake?.address as string | undefined;
	const networkInfo = getNetworkInformationFromIP(clientIPAddress);
	if (networkInfo.isPrivateLink) {
		const accountLinkID = tennatInfo?.customData?.accountLinkID;
		if (networkInfo.privateLinkId === accountLinkID) {
			return { message: "This is a private link socket connection", shouldConnect: false };
		} else {
			return { message: "should connect", shouldConnect: true };
		}
	} else {
		const accountLinkID = tennatInfo?.customData?.accountLinkID;
		if (accountLinkID) {
			return { message: "This is a failed private link tenant socket connection from public network", shouldConnect: false };
		} else {
			return { message: 'should connect', shouldConnect: false};
		}
	}
}
