/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type ICodeDetailsLoader,
	type IFluidModuleWithDetails,
} from "@fluidframework/container-definitions/legacy";
import type {
	ContainerSchema,
	IFluidContainer as IFluidContainerFull,
} from "@fluidframework/fluid-static";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
} from "@fluidframework/fluid-static/internal";
import { createDetachedContainer } from "@fluidframework/container-loader/legacy";
import {
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	createOdspCreateContainerRequest,
	isOdspResolvedUrl,
} from "@fluidframework/odsp-driver/legacy";
import type { OdspClientProps } from "@fluidframework/odsp-client/beta";
import { v4 as uuid } from "uuid";

export type IFluidContainer<T extends ContainerSchema> = Omit<
	IFluidContainerFull<T>,
	"connect" | "disconnect" | "connectionState"
>;

// Example of usage (Copilot Boards):
// codeDetails = { package: "@fluidx/copilot-board-container" },

/**
 * This is similar to new OdspClient().createContainer(), but differs in the following ways:
 * 1. It will not attempt to make websocket connect on attach(). This utility is useful in scenarios where
 *    a file is created by service client, and once file is created, the job is done.
 *    Note: connection.tokenProvider.fetchWebsocketToken is not used.
 * 2. It accepts custom codeDetails, such that files could be created for existing apps (assumes that app could
 *    reason over the rest of the file content).
 * @param properties - OdspClientProps to create the container with.
 * @param schema - The schema for the container to create.
 * @param codeDetails - The code details to use for the container.
 * @returns The created Fluid container.
 */
export async function createOdspContainer<T extends ContainerSchema>(
	properties: OdspClientProps,
	schema: T,
	codeDetails = { package: "no-dynamic-package" },
): Promise<IFluidContainer<T>> {
	const runtimeFactory = createDOProviderContainerRuntimeFactory({
		schema,
		compatibilityMode: "2",
	});
	const connection = properties.connection;

	const documentServiceFactory = new OdspDocumentServiceFactory(
		async (options) =>
			connection.tokenProvider.fetchStorageToken(options.siteUrl, options.refresh),
		async () => {
			throw new Error("Websocket connection should not happen!");
		},
	);

	const codeLoader: ICodeDetailsLoader = {
		load: async (): Promise<IFluidModuleWithDetails> => {
			return {
				module: { fluidExport: runtimeFactory },
				details: codeDetails,
			};
		},
	};

	const container = await createDetachedContainer({
		urlResolver: new OdspDriverUrlResolver(),
		documentServiceFactory,
		codeLoader,
		logger: properties.logger,
		configProvider: properties.configProvider,
		codeDetails,
	});

	const fluidContainer = await createFluidContainer({ container });

	fluidContainer.attach = async (): Promise<string> => {
		fluidContainer.attach = () => {
			throw new Error("attach can only be called once");
		};

		await container.attach(
			createOdspCreateContainerRequest(
				connection.siteUrl,
				connection.driveId,
				"", // filePath
				uuid(), // fileName
			),
			{
				deltaConnection: "none", // ensure no websocket connection is made
			},
		);

		const resolvedUrl = container.resolvedUrl;

		if (resolvedUrl === undefined || !isOdspResolvedUrl(resolvedUrl)) {
			throw new Error("Resolved Url not available on attached container");
		}

		/**
		 * A unique identifier for the file within the provided SharePoint Embedded container ID. When you attach a container,
		 * a new `itemId` is created in the user's drive, which developers can use for various operations
		 * like updating, renaming, moving the Fluid file, changing permissions, and more. `itemId` is used to load the container.
		 */
		return resolvedUrl.itemId;
	};

	return fluidContainer as IFluidContainer<T>;
}
