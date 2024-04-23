/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseClient } from "@fluidframework/base-client";
import { AzureUrlResolver, createAzureCreateNewRequest } from "./AzureUrlResolver.js";
import type { AzureClientProps, AzureConnectionConfig } from "./interfaces.js";
import { isAzureRemoteConnectionConfig } from "./utils.js";

/**
 * Strongly typed id for connecting to a local Azure Fluid Relay.
 */
const LOCAL_MODE_TENANT_ID = "local";
const getTenantId = (connectionProperties: AzureConnectionConfig): string => {
	return isAzureRemoteConnectionConfig(connectionProperties)
		? connectionProperties.tenantId
		: LOCAL_MODE_TENANT_ID;
};

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Fluid Relay or,
 * when running with local tenantId, have it be backed by a local Azure Fluid Relay instance.
 * @public
 */
export class AzureClient extends BaseClient {
	public constructor(properties: AzureClientProps) {
		super(properties, new AzureUrlResolver(), () =>
			createAzureCreateNewRequest(
				properties.connection.endpoint,
				getTenantId(properties.connection),
			),
		);
	}

	/**
	 * Creates new detached container out of specific version of another container.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param id - Unique ID of the source container in Azure Fluid Relay.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @param version - Unique version of the source container in Azure Fluid Relay.
	 * It defaults to latest version if parameter not provided.
	 * @returns New detached container instance along with associated services.
	 */
	public async copyContainer<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
		version?: AzureContainerVersion,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: AzureContainerServices;
	}> {}
}
