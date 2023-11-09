/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import {
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	createOdspCreateContainerRequest,
} from "@fluidframework/odsp-driver";
import {
	type ContainerSchema,
	DOProviderContainerRuntimeFactory,
	IFluidContainer,
	FluidContainer,
	IRootDataObject,
} from "@fluidframework/fluid-static";
import {
	AttachState,
	IContainer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { Loader } from "@fluidframework/container-loader";
import { v4 as uuid } from "uuid";
import {
	IOdspResolvedUrl,
	OdspResourceTokenFetchOptions,
} from "@fluidframework/odsp-driver-definitions";
import { ITokenResponse } from "@fluidframework/azure-client";
// eslint-disable-next-line import/no-deprecated
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	OdspClientProps,
	OdspConnectionConfig,
	OdspContainerServices,
	OdspServiceAttributes,
} from "./interfaces";
import { OdspAudience } from "./odspAudience";

/**
 * @alpha
 */
export class OdspClient {
	private readonly documentServiceFactory: IDocumentServiceFactory;
	private readonly urlResolver: OdspDriverUrlResolver;

	public constructor(private readonly properties: OdspClientProps) {
		const getSharePointToken = async (options: OdspResourceTokenFetchOptions) => {
			const tokenResponse: ITokenResponse =
				await this.properties.connection.tokenProvider.fetchStorageToken(
					options.siteUrl,
					"",
				);
			return {
				token: tokenResponse.jwt,
			};
		};

		const getPushServiceToken = async (options: OdspResourceTokenFetchOptions) => {
			const tokenResponse: ITokenResponse =
				await this.properties.connection.tokenProvider.fetchOrdererToken(options.siteUrl);
			return {
				token: tokenResponse.jwt,
			};
		};
		this.documentServiceFactory = new OdspDocumentServiceFactory(
			getSharePointToken,
			getPushServiceToken,
		);

		this.urlResolver = new OdspDriverUrlResolver();
	}

	public async createContainer(containerSchema: ContainerSchema): Promise<{
		container: IFluidContainer;
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

		return { container: fluidContainer, services };
	}

	public async getContainer(
		sharingUrl: string,
		containerSchema: ContainerSchema,
	): Promise<{
		container: IFluidContainer;
		services: OdspContainerServices;
	}> {
		const loader = this.createLoader(containerSchema);
		const container = await loader.resolve({ url: sharingUrl });

		// eslint-disable-next-line import/no-deprecated
		const rootDataObject = await requestFluidObject<IRootDataObject>(container, "/");
		const fluidContainer = new FluidContainer(container, rootDataObject);
		const services = await this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	private createLoader(containerSchema: ContainerSchema): Loader {
		const runtimeFactory = new DOProviderContainerRuntimeFactory(containerSchema);
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
		const createNewRequest: IRequest = createOdspCreateContainerRequest(
			connection.siteUrl,
			connection.driveId,
			connection.path,
			uuid(),
		);

		// eslint-disable-next-line import/no-deprecated
		const rootDataObject = await requestFluidObject<IRootDataObject>(container, "/");

		/**
		 * See {@link FluidContainer.attach}
		 */
		const attach = async (): Promise<string> => {
			if (container.attachState !== AttachState.Detached) {
				throw new Error("Cannot attach container. Container is not in detached state");
			}
			await container.attach(createNewRequest);
			const resolvedUrl = container.resolvedUrl as IOdspResolvedUrl;
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			/**
			 * A unique identifier for the file within the provided RaaS drive ID. When you attach a container,
			 * a new `itemId` is created in the user's drive, which developers can use for various operations
			 * like updating, renaming, moving the Fluid file, changing permissions, and more.
			 */
			return resolvedUrl.itemId;
		};
		const fluidContainer = new FluidContainer(container, rootDataObject);
		fluidContainer.attach = attach;
		return fluidContainer;
	}

	private async getContainerServices(container: IContainer): Promise<OdspContainerServices> {
		const getAttributes = async (): Promise<OdspServiceAttributes> => {
			const resolvedUrl = container.resolvedUrl as IOdspResolvedUrl;
			if (resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			const sharingUrl = await container.getAbsoluteUrl("/");
			if (sharingUrl === undefined) {
				throw new Error("Container has no absolute url");
			}

			return {
				sharingUrl,
				driveId: resolvedUrl.driveId,
			};
		};

		return {
			tenantAttributes: getAttributes,
			audience: new OdspAudience(container),
		};
	}
}
