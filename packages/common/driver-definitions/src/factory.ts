/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Factory options interface which are going to be used in the loader layer.
 */
export interface IDriverFactoryLoaderOptions {
	[DriverFactoryLoaderOptions.summarizeProtocolTree]: boolean;
}

export interface IDriverFactoryOptions extends Partial<IDriverFactoryLoaderOptions> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[index: string]: any;
}

/**
 * Factory options which are going to be used in the loader layer.
 */
export enum DriverFactoryLoaderOptions {
	// Key to indicate whether the single commit summary is enabled
	summarizeProtocolTree = "summarizeProtocolTree",
}
