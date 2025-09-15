/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactoryAlpha } from "@fluidframework/tree/internal";
import z from "zod";

import { buildFunc, exposeMethodsSymbol, type ExposedMethods, type IExposedMethods } from "../../methodBinding.js";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.usersWithMethods");

export class UserWithMethods extends sf.objectAlpha(
	"User",
	{
		firstName: sf.required(sf.string, {
			metadata: {
				description: "The user's first name",
			},
		}),
		lastName: sf.required(sf.string, {
			metadata: {
				description: "The user's last name",
			},
		}),
		displayName: sf.optional(sf.string, {
			metadata: {
				description: "The user's display name.",
			},
		}),
	},
	{
		metadata: {
			description: "A user in the system",
		},
	},
)
implements IExposedMethods
{
	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.expose(UserWithMethods, "setDisplayName", buildFunc(
      { description: "Sets the user's display name. This is the only logic that will work for correctly setting it.", returns: z.void() }
    ));
	}

	public [exposeMethodsSymbol](methods: ExposedMethods): void {
		UserWithMethods[exposeMethodsSymbol](methods);
	}


	public setDisplayName(): void {
		this.displayName = this.firstName.slice(0, 2) + this.lastName;
	}
}
