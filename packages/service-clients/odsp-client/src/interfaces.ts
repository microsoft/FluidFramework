/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IConfigProviderBase,
	IDisposable,
	ITelemetryBaseLogger,
	Listenable,
} from "@fluidframework/core-interfaces";
import type {
	ContainerAttachProps,
	ContainerSchema,
	IFluidContainer,
	IMember,
	IServiceAudience,
} from "@fluidframework/fluid-static";

import type { IOdspTokenProvider } from "./token.js";

/**
 * Defines the necessary properties that will be applied to all containers
 * created by an OdspClient instance. This includes callbacks for the authentication tokens
 * required for ODSP.
 * @beta
 */
export interface OdspConnectionConfig {
	/**
	 * Instance that provides AAD endpoint tokens for Push and SharePoint
	 */
	tokenProvider: IOdspTokenProvider;

	/**
	 * Site url representing ODSP resource location. It points to the specific SharePoint site where you can store and access the containers you create.
	 */
	siteUrl: string;

	/**
	 * SharePoint Embedded Container Id of the tenant where Fluid containers are created
	 */
	driveId: string;

	/**
	 * Specifies the file path where Fluid files are created. If passed an empty string, the Fluid files will be created at the root level.
	 */
	filePath: string;
}
/**
 * @beta
 */
export interface OdspClientProps {
	/**
	 * Configuration for establishing a connection with the ODSP Fluid Service (Push).
	 */
	readonly connection: OdspConnectionConfig;

	/**
	 * Optional. A logger instance to receive diagnostic messages.
	 */
	readonly logger?: ITelemetryBaseLogger;

	/**
	 * Base interface for providing configurations to control experimental features. If unsure, leave this undefined.
	 */
	readonly configProvider?: IConfigProviderBase;
}

/**
 * @beta
 */
export interface OdspContainerAttachProps {
	/**
	 * The file path where Fluid containers are created. If undefined, the file is created at the root.
	 */
	filePath: string | undefined;

	/**
	 * The file name of the Fluid file. If undefined, the file is named with a GUID.
	 */
	fileName: string | undefined;
}

/**
 * Events emitted by the ODSP container service to notify consumers of select
 * container changes.
 * @beta
 * @sealed
 */
export interface IOdspContainerServicesEvents {
	/**
	 * Emitted when the read-only state of the container changes.
	 * Consumers can call `OdspContainerServices.getReadOnlyState()` to get the updated value.
	 */
	readOnlyStateChanged: () => void;
	/**
	 * Emitted when the sensitivity label of the container changes.
	 * Consumers can call `OdspContainerServices.getSensitivityLabelsInfo()` to get the updated value.
	 */
	sensitivityLabelsInfoChanged: () => void;
}

/**
 * ODSP version of the IFluidContainer interface.
 * @beta
 */
export interface IOdspFluidContainer<
	TContainerSchema extends ContainerSchema = ContainerSchema,
> extends IFluidContainer<TContainerSchema> {
	/**
	 * A newly created container starts detached from the collaborative service.
	 * Calling `attach()` uploads the new container to the service and connects to the collaborative service.
	 *
	 * This function is the same as the IFluidContainer.attach function, but has ODSP specific function signatures.
	 *
	 * @param props - Optional properties to pass to the attach function.
	 *
	 * @returns A promise which resolves when the attach is complete, with the string identifier of the container.
	 */
	attach(props?: ContainerAttachProps<OdspContainerAttachProps>): Promise<string>;
}

/**
 * OdspContainerServices is returned by the OdspClient alongside a FluidContainer. It holds the
 * functionality specifically tied to the ODSP service, and how the data stored in the
 * FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to
 * use, will not be included here but rather on the FluidContainer class itself.
 * @beta
 * @sealed
 */
export interface OdspContainerServices extends IDisposable {
	events: Listenable<IOdspContainerServicesEvents>;
	/**
	 * Provides an object that facilitates obtaining information about users present in the Fluid session, as well as listeners for roster changes triggered by users joining or leaving the session.
	 */
	audience: IOdspAudience;

	/**
	 * Gets the read-only state of the container, if available.
	 * This is not available until the container is in the "Connected" state.
	 * @remarks
	 * In the case that the read-only state cannot be determined, wait for the "readOnlyStateChanged" event to be emitted.
	 * @returns The read-only state (true when readonly, false when editable), or undefined if not available.
	 */
	getReadOnlyState(): boolean | undefined;
	/**
	 * Gets the sensitivity labels info of the container, if available.
	 * This is not available until the container is in the "Connected" state, and will only be available
	 * if sensitivity labels have been applied to the container.
	 * @remarks
	 * In the case that the sensitivity labels info are expected but cannot be determined, wait for the "sensitivityLabelChanged" event to be emitted.
	 * @returns The sensitivity labels info string, or undefined if not available.
	 */
	getSensitivityLabelsInfo(): string | undefined;
}

/**
 * Since ODSP provides user names and email for all of its members, we extend the
 * {@link @fluidframework/fluid-static#IMember} interface to include this service-specific value.
 * It will be returned for all audience members connected.
 * @beta
 */
export interface OdspMember extends IMember {
	/**
	 * The object ID (oid) for the user, unique among each individual user connecting to the session.
	 */
	id: string;
	/**
	 * The user's name
	 */
	name: string;
	/**
	 * The user's email
	 */
	email: string;
}

/**
 * Audience object for ODSP containers
 * @beta
 */
export type IOdspAudience = IServiceAudience<OdspMember>;

/**
 * Represents token response
 * @beta
 */
export interface TokenResponse {
	/**
	 * Token value
	 */
	token: string;

	/**
	 * Whether or not the token was obtained from local cache.
	 * @remarks `undefined` indicates that it could not be determined whether or not the token was obtained this way.
	 */
	fromCache?: boolean;
}
