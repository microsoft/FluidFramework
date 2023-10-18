/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface of managing resources for messages that are broadcasted among services.
 * IServiceMessage is not the message that flows through Kafka and not used explicitly in FluidFramework yet.
 * Its definition is hidden in FluidFramework.
 * This interface is created to properly clean up resources in IResource.dispose function
 */
export interface IServiceMessageResourceManager {
	/**
	 * Close and clean up resources
	 */
	close(): Promise<void>;
}
