/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { v4 as uuid } from "uuid";
import {
	AttachState,
	IContainer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";
import { FluidObject, IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { Loader } from "@fluidframework/container-loader";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import {
	type ContainerSchema,
	createDOProviderContainerRuntimeFactory,
	IFluidContainer,
	createFluidContainer,
	IRootDataObject,
	createServiceAudience,
	ContainerAttachProps,
} from "@fluidframework/fluid-static";
import {
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	createOdspCreateContainerRequest,
	createOdspUrl,
	isOdspResolvedUrl,
} from "@fluidframework/odsp-driver";
import type {
	OdspResourceTokenFetchOptions,
	TokenResponse,
} from "@fluidframework/odsp-driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import {
	OdspClientProps,
	OdspContainerServices,
	OdspConnectionConfig,
	OdspContainerAttachProps,
} from "./interfaces.js";
import { createOdspAudienceMember } from "./odspAudience.js";
import { type IOdspTokenProvider } from "./token.js";

async function getStorageToken(
	options: OdspResourceTokenFetchOptions,
	tokenProvider: IOdspTokenProvider,
): Promise<TokenResponse> {
	const tokenResponse: TokenResponse = await tokenProvider.fetchStorageToken(
		options.siteUrl,
		options.refresh,
	);
	return tokenResponse;
}

async function getWebsocketToken(
	options: OdspResourceTokenFetchOptions,
	tokenProvider: IOdspTokenProvider,
): Promise<TokenResponse> {
	const tokenResponse: TokenResponse = await tokenProvider.fetchWebsocketToken(
		options.siteUrl,
		options.refresh,
	);
	return tokenResponse;
}

/**
 * OdspClient provides the ability to have a Fluid object backed by the ODSP service within the context of Microsoft 365 (M365) tenants.
 * @sealed
 * @beta
 */
export class OdspClient {
	private readonly documentServiceFactory: IDocumentServiceFactory;
	private readonly urlResolver: OdspDriverUrlResolver;

	public constructor(private readonly properties: OdspClientProps) {
		this.documentServiceFactory = new OdspDocumentServiceFactory(
			async (options) => getStorageToken(options, this.properties.connection.tokenProvider),
			async (options) => getWebsocketToken(options, this.properties.connection.tokenProvider),
		);

		this.urlResolver = new OdspDriverUrlResolver();
	}

	public async createContainer<T extends ContainerSchema>(
		containerSchema: T,
	): Promise<{
		container: IFluidContainer<T>;
		services: OdspContainerServices;
	}> {
		const loader = this.createLoader(containerSchema);

		const container = await loader.createDetachedContainer({
			package: "no-dynamic-package",
			config: {},
		});

		const fluidContainer = await this.createFluidContainer(
			container,
			this.properties.connection,
		);

		const services = await this.getContainerServices(container);

		return { container: fluidContainer as IFluidContainer<T>, services };
	}

	public async getContainer<T extends ContainerSchema>(
		id: string,
		containerSchema: T,
	): Promise<{
		container: IFluidContainer<T>;
		services: OdspContainerServices;
	}> {
		const loader = this.createLoader(containerSchema);
		const url = createOdspUrl({
			siteUrl: this.properties.connection.siteUrl,
			driveId: this.properties.connection.driveId,
			itemId: id,
			dataStorePath: "",
		});
		const container = await loader.resolve({ url });

		const fluidContainer = createFluidContainer({
			container,
			rootDataObject: await this.getContainerEntryPoint(container),
		});
		const services = await this.getContainerServices(container);
		return { container: fluidContainer as IFluidContainer<T>, services };
	}

	private createLoader(schema: ContainerSchema): Loader {
		const runtimeFactory = createDOProviderContainerRuntimeFactory({ schema });
		const load = async (): Promise<IFluidModuleWithDetails> => {
			return {
				module: { fluidExport: runtimeFactory },
				details: { package: "no-dynamic-package", config: {} },
			};
		};

		const codeLoader = { load };
		const client: IClient = {
			details: {
				capabilities: { interactive: true },
			},
			permission: [],
			scopes: [],
			user: { id: "" },
			mode: "write",
		};

		return new Loader({
			urlResolver: this.urlResolver,
			documentServiceFactory: this.documentServiceFactory,
			codeLoader,
			logger: this.properties.logger,
			options: { client },
		});
	}

	private async createFluidContainer(
		container: IContainer,
		connection: OdspConnectionConfig,
	): Promise<IFluidContainer> {
		const rootDataObject = await this.getContainerEntryPoint(container);

		/**
		 * See {@link FluidContainer.attach}
		 */
		const attach = async (
			odspProps?: ContainerAttachProps<OdspContainerAttachProps>,
		): Promise<string> => {
			const createNewRequest: IRequest = createOdspCreateContainerRequest(
				connection.siteUrl,
				connection.driveId,
				odspProps?.filePath ?? "",
				odspProps?.fileName ?? uuid(),
			);
			if (container.attachState !== AttachState.Detached) {
				throw new Error("Cannot attach container. Container is not in detached state");
			}
			await container.attach(createNewRequest);

			const resolvedUrl = container.resolvedUrl;

			if (resolvedUrl === undefined || !isOdspResolvedUrl(resolvedUrl)) {
				throw new Error("Resolved Url not available on attached container");
			}

			/**
			 * A unique identifier for the file within the provided RaaS drive ID. When you attach a container,
			 * a new `itemId` is created in the user's drive, which developers can use for various operations
			 * like updating, renaming, moving the Fluid file, changing permissions, and more. `itemId` is used to load the container.
			 */
			return resolvedUrl.itemId;
		};
		const fluidContainer = createFluidContainer({ container, rootDataObject });
		fluidContainer.attach = attach;
		return fluidContainer;
	}

	private async getContainerServices(container: IContainer): Promise<OdspContainerServices> {
		return {
			audience: createServiceAudience({
				container,
				createServiceMember: createOdspAudienceMember,
			}),
		};
	}

	private async getContainerEntryPoint(container: IContainer): Promise<IRootDataObject> {
		const rootDataObject: FluidObject<IRootDataObject> = await container.getEntryPoint();
		assert(
			rootDataObject.IRootDataObject !== undefined,
			0x878 /* entryPoint must be of type IRootDataObject */,
		);
		return rootDataObject.IRootDataObject;
	}
}
