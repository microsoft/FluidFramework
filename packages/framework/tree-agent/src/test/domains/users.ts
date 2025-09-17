/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactoryAlpha } from "@fluidframework/tree/internal";
import z from "zod";

import {
	buildFunc,
	exposeMethodsSymbol,
	type ExposedMethods,
	type IExposedMethods,
} from "../../methodBinding.js";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.users");

export class User
	extends sf.objectAlpha(
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
					description: "The user's display name",
				},
			}),
			created: sf.required(sf.string, {
				metadata: {
					description: "The ISO-8601 timestamp when the user was created",
				},
			}),
			email: sf.optional(sf.string, {
				metadata: {
					description: "The user's email address",
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
		methods.expose(
			User,
			"setDisplayName",
			buildFunc({
				description:
					"Sets the user's display name. This is the only logic that will work for correctly setting it.",
				returns: z.void(),
			}),
		);
	}

	public [exposeMethodsSymbol](methods: ExposedMethods): void {
		User[exposeMethodsSymbol](methods);
	}

	/**
	 * Sets the display name for the user.
	 * @remarks
	 * We don't want agents to try to fall back to alternate logic instead of using this method,
	 * which can be accomplished (at least attempted!) by setting `description` appropriately
	 * when exposing this method in the `exposeMethodsSymbol` static.
	 */
	public setDisplayName(): void {
		this.displayName = this.firstName.slice(0, 2) + this.lastName;
	}
}

export class Users extends sf.mapAlpha("Users", User, {
	metadata: {
		description: `A collection of users in the system. The keys are user IDs. A user ID is always the first two letters of the user's first name followed by their full last name. For example, the user ID for "Alex Pardes" is "alpardes".`,
	},
}) {}
