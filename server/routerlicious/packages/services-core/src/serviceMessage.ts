/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface of managing resources (publisher and consumers) for sending and receiving IServiceMessage.
 * IServiceMessage is the message broadcasted among services, not the one that flows through Ordering service(Kafka).
 * It is not used explicitly in FluidFramework yet, so its definition is hidden in FluidFramework.
 * This interface is created to properly clean up resources in current runner framework.
 * @internal
 */
export interface IServiceMessageResourceManager {
	/**
	 * Close and clean up resources
	 */
	close(): Promise<void>;
}
