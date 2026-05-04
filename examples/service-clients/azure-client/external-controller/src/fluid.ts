/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createAzureServiceClient } from "@fluidframework/azure-client/alpha";
import {
	InsecureTinyliciousTokenProvider,
	createTinyliciousServiceClient,
} from "@fluidframework/tinylicious-driver/alpha";
import { TreeViewConfiguration } from "fluid-framework";
import { treeDataStoreKind } from "fluid-framework/alpha";

import { TwoDiceApp, Dice } from "./schema.js";

const treeViewConfig = new TreeViewConfiguration({
	schema: TwoDiceApp,
	enableSchemaValidation: true,
});

/**
 * Data store kind for the dice roller application.
 * Defines the schema, view configuration, and initial state for a SharedTree-based two-dice roller.
 */
export const diceRollerDataStoreKind = treeDataStoreKind({
	type: "dice-roller",
	config: treeViewConfig,
	initializer: () =>
		new TwoDiceApp({
			dice1: new Dice({ value: 1 }),
			dice2: new Dice({ value: 1 }),
		}),
});

const fluidClient = process.env.FLUID_CLIENT;

const serviceOptions = {
	minVersionForCollab: "2.100.0",
} as const;

/**
 * The active service client — tinylicious by default, Azure when FLUID_CLIENT=azure.
 */
export const service =
	fluidClient === "azure"
		? createAzureServiceClient({
				...serviceOptions,
				connection: {
					type: "local",
					endpoint: "http://localhost:7071",
					tokenProvider: new InsecureTinyliciousTokenProvider(),
				},
			})
		: createTinyliciousServiceClient(serviceOptions);
