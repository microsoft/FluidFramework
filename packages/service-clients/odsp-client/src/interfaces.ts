/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IConfigProviderBase,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type {
	IMember,
	IServiceAudience,
	ContainerSchema,
	IFluidContainer,
} from "@fluidframework/fluid-static";
import type {
	ISharingLinkKind,
	ShareLinkInfoType,
	IPersistedCache,
	HostStoragePolicy,
} from "@fluidframework/odsp-driver-definitions/internal";

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
	 * Should be set to true only by application that is CLP compliant, for CLP compliant workflow.
	 * This argument has no impact if application is not properly registered with Sharepoint.
	 */
	isClpCompliant?: boolean;
}

/**
 * @alpha
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

	/**
	 * Optional. This interface can be implemented by the host to provide durable caching across sessions.
	 */
	readonly persistedCache?: IPersistedCache;

	/**
	 * Optional. Defines various policies controlling behavior of ODSP driver
	 */
	readonly hostPolicy?: HostStoragePolicy;
}

/**
 * Specifies location / name of the file.
 * If no argument is provided, file with random name (uuid) will be created.
 * Please see {@link OdspContainerAttachFunctor} for more details
 * @alpha
 */
export type OdspContainerAttachArgs =
	| {
			/**
			 * The file path where Fluid containers are created. If undefined, the file is created at the root.
			 */
			filePath?: string;

			/**
			 * The file name of the Fluid file. If undefined, the file is named with a GUID.
			 * If a file with such name exists, file with different name is created - Sharepoint will
			 * add (2), (3), ... to file name to make it unique and avoid conflict on creation.
			 */
			fileName?: string;

			/**
			 * If provided, will instrcuct Sharepoint to create a sharing link as part of file creation flow.
			 */
			createShareLinkType?: ISharingLinkKind;
	  }
	| {
			/**
			 * (Microsoft internal only) Files supporting FF format on alternate partition could point to existing file.
			 */
			itemId: string;
	  };

/**
 * An object type returned by attach call.
 * Please see {@link OdspContainerAttachFunctor} for more details
 * @alpha
 */
export interface OdspContainerAttachResult {
	/**
	 * An ID of the document created. This ID could be passed to future IOdspClient.getContainer() call
	 */
	itemId: string;

	/**
	 * If OdspContainerAttachArgs.createShareLinkType was provided as part of OdspContainerAttachArgs payload,
	 * `shareLinkInfo` will contain sharing link information for created file.
	 */
	shareLinkInfo?: ShareLinkInfoType;
}

/**
 * Signature of the createFn callback returned by IOdspClient.createContainer().
 * Used to attach container to stroage (create container in storage).
 * @param param - Specifies where file should be created and how it should be named. If not provided,
 * file with random name (uuid) will be created in the root of the drive.
 * @param options - options controlling creation.
 * @alpha
 */
export type OdspContainerAttachFunctor = (
	param?: OdspContainerAttachArgs,
) => Promise<OdspContainerAttachResult>;

/**
 * Interface describing various options controling container open
 * @alpha
 */
export interface OdspContainerOpenOptions {
	/**
	 * A sharing link could be provided to identify a file. This link has to be in very specific format - see
	 * OdspContainerAttachResult.sharingLink.
	 * When sharing link is provided, it uniquely identifies a file in Sharepoint - OdspConnectionConfig information
	 * (part of OdspClientProps.connection provided to createOdspClient()) is ignored in such case.
	 *
	 * This is used to save the network calls while doing trees/latest call as if the client does not have
	 * permission then this link can be redeemed for the permissions in the same network call.
	 */
	sharingLinkToRedeem?: string;

	/**
	 * Can specify specific file version to open. If specified, opened container will be read-only.
	 * If not specified, current (latest, read-write) version of the file is opened.
	 */
	fileVersion?: string;
}

/**
 * OdspContainerServices is returned by the OdspClient alongside a FluidContainer. It holds the
 * functionality specifically tied to the ODSP service, and how the data stored in the
 * FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to
 * use, will not be included here but rather on the FluidContainer class itself.
 * @beta
 */
export interface OdspContainerServices {
	/**
	 * Provides an object that facilitates obtaining information about users present in the Fluid session, as well as listeners for roster changes triggered by users joining or leaving the session.
	 */
	audience: IOdspAudience;
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

/**
 * IOdspClient provides the ability to manipulate Fluid containers backed by the ODSP service within the context of Microsoft 365 (M365) tenants.
 * @alpha
 */
export interface IOdspClient {
	/**
	 * Creates a new container in memory. Calling attach() on returned container will create container in storage.
	 * @param containerSchema - schema of the created container
	 */
	createContainer<T extends ContainerSchema>(
		containerSchema: T,
	): Promise<{
		container: IFluidContainer<T>;
		services: OdspContainerServices;
		createFn: OdspContainerAttachFunctor;
	}>;

	/**
	 * Opens existing container. If container does not exist, the call will fail with an error with errorType = DriverErrorTypes.fileNotFoundOrAccessDeniedError.
	 * @param itemId - ID of the container in storage. Used together with OdspClientProps.connection info (see createOdspClient()) to identify a file in Sharepoint.
	 * @param options - various options controlling container flow.
	 * This argument has no impact if application is not properly registered with Sharepoint.
	 * @param containerSchema - schema of the container.
	 */
	getContainer<T extends ContainerSchema>(
		itemId: string,
		containerSchema: T,
		options?: OdspContainerOpenOptions,
	): Promise<{
		container: IFluidContainer<T>;
		services: OdspContainerServices;
	}>;
}
