/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactoryAlpha } from "@fluidframework/tree/internal";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.users");

export class User extends sf.objectAlpha(
	"User",
	{
		name: sf.required(sf.string, {
			metadata: {
				description: "The user's full name",
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
) {}

export class Users extends sf.recordAlpha("Users", User, {
	metadata: {
		description: `A collection of users in the system. The keys are user IDs. A user ID is always the first two letters of the user's first name followed by their full last name. For example, the user ID for "Alex Pardes" is "alpardes".`,
	},
}) {}
