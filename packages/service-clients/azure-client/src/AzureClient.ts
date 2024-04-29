/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BaseClient,
	type IContainerServices,
	type IContainerVersion,
	type IGetVersionsOptions,
} from "@fluidframework/base-client";
import type { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
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
	public constructor(protected readonly properties: AzureClientProps) {
		// remove trailing slash from URL if any
		properties.connection.endpoint = properties.connection.endpoint.replace(/\/$/, "");
		// The local service implementation differs from the Azure Fluid Relay in blob
		// storage format. Azure Fluid Relay supports whole summary upload. Local currently does not.
		const isRemoteConnection = isAzureRemoteConnectionConfig(properties.connection);

		super(
			{
				...properties,
				enableWholeSummaryUpload: isRemoteConnection,
				enableDiscovery: isRemoteConnection,
			},
			new AzureUrlResolver(),
			properties.connection.tokenProvider,
			() =>
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
		version?: IContainerVersion,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: IContainerServices;
	}> {
		const url = new URL(this.properties.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.properties.connection.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.properties.connection)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));
		return super.copyContainer(url.href, containerSchema, version);
	}

	/**
	 * Accesses the existing container given its unique ID in the Azure Fluid Relay.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param id - Unique ID of the container in Azure Fluid Relay.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @returns Existing container instance along with associated services.
	 */
	public async getContainer<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: IContainerServices;
	}> {
		const url = new URL(this.properties.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.properties.connection.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.properties.connection)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));
		return super.getContainer(url.href, containerSchema);
	}

	/**
	 * Get the list of versions for specific container.
	 * @param id - Unique ID of the source container in Azure Fluid Relay.
	 * @param options - "Get" options. If options are not provided, API
	 * will assume maxCount of versions to retrieve to be 5.
	 * @returns Array of available container versions.
	 */
	public async getContainerVersions(
		id: string,
		options?: IGetVersionsOptions,
	): Promise<IContainerVersion[]> {
		const url = new URL(this.properties.connection.endpoint);
		url.searchParams.append("storage", encodeURIComponent(this.properties.connection.endpoint));
		url.searchParams.append(
			"tenantId",
			encodeURIComponent(getTenantId(this.properties.connection)),
		);
		url.searchParams.append("containerId", encodeURIComponent(id));

		return super.getContainerVersions(url.href, options);
	}
}
