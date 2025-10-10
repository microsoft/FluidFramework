/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";

/**
 * Socket storage discovery api response
 * @legacy @beta
 */
export interface ISocketStorageDiscovery {
	// The id of the web socket
	id: string;

	// SPO gives us runtimeTenantId, we remap it to tenantId
	// See getSocketStorageDiscovery
	runtimeTenantId?: string;
	tenantId: string;

	snapshotStorageUrl: string;
	deltaStorageUrl: string;

	/**
	 * PUSH URL
	 */
	deltaStreamSocketUrl: string;

	/**
	 * The access token for PushChannel. Optionally returned, depending on implementation.
	 * OneDrive for Consumer implementation returns it and OneDrive for Business implementation
	 * does not return it and instead expects token to be returned via `getWebsocketToken` callback
	 * passed as a parameter to `OdspDocumentService.create()` factory.
	 */
	socketToken?: string;

	/**
	 * This is the time within which client has to refresh the session on (ODSP) relay service.
	 */
	refreshSessionDurationSeconds?: number;

	/**
	 * Represent the sensitivity labels info for the file. Keeping it optional for back-compat. The
	 * response will contain empty labels when the file has no labels, so this field will be there
	 * even if file has no labels when the service will implement this contract.
	 */
	sensitivityLabelsInfo?: ISensitivityLabelsInfo;
}

/**
 * Sensitivity labels information for a file, part of the socket storage discovery response.
 * @legacy @beta
 */
export interface ISensitivityLabelsInfo {
	/** ISO format timestamp when the label info snapshot was generated. */
	timestamp: string;
	/** List of applied sensitivity labels. Empty if none. */
	labels: ISensitivityLabel[];
}

/**
 * A single sensitivity label applied to a document, part of the socket storage discovery response.
 * @legacy @beta
 */
export interface ISensitivityLabel {
	/** Unique identifier of the sensitivity label. */
	sensitivityLabelId: string;
	/** Tenant under which the label is defined. */
	tenantId: string;
	/** How the label was assigned, for example "standard". */
	assignmentMethod: string;
	/** Email of the user who applied the label. */
	appliedByUserEmail: string;
}

/**
 * An interface that allows a concrete instance of a driver factory to interrogate itself
 * to find out if it is session aware.
 * @legacy @beta
 */
export interface IProvideSessionAwareDriverFactory {
	readonly IRelaySessionAwareDriverFactory: IRelaySessionAwareDriverFactory;
}

/**
 * An interface that allows a concrete instance of a driver factory to call the `getRelayServiceSessionInfo`
 * function if it session aware.
 * @legacy @beta
 */
export interface IRelaySessionAwareDriverFactory extends IProvideSessionAwareDriverFactory {
	getRelayServiceSessionInfo(
		resolvedUrl: IResolvedUrl,
	): Promise<ISocketStorageDiscovery | undefined>;
}
