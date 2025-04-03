/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactoryAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

// An extremely simple domain model for "smoke" tests to ensure that the AI agent can execute the most basic of tasks without failing.

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.smoke");

export class Smoke extends sf.object(
	"Smoke",
	{
		color: sf.required(sf.string, {
			metadata: {
				description:
					"The color of the smoke - either 'white' (to indicate a new Pope has been chosen) or 'black' (to indicate that the cardinals are still deliberating)",
			},
		}),
	},
	{
		metadata: {
			description: `The smoke issued by the papal conclave when choosing a new pope`,
		},
	},
) {}

export function stringifySmoke(smoke: Smoke): string {
	return `The smoke is ${smoke.color}. A new pope has ${smoke.color === "white" ? "" : "not "}been chosen.`;
}
