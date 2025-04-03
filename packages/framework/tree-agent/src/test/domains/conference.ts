/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactoryAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import { llmDefault } from "../../utils.js";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.conference");

export class Session extends sf.object("Session", {
	id: sf.identifier,
	title: sf.string,
	abstract: sf.string,
	sessionType: sf.required(sf.string, {
		metadata: {
			description:
				"This is one of four possible strings: 'Session', 'Workshop', 'Panel', or 'Keynote'",
		},
	}),
	created: sf.optional(sf.number, {
		metadata: {
			custom: { [llmDefault]: () => Date.now() },
		},
	}),
	lastChanged: sf.optional(sf.number, {
		metadata: {
			custom: { [llmDefault]: () => Date.now() },
		},
	}),
}) {}

export const SessionType = {
	session: "Session",
	workshop: "Workshop",
	panel: "Panel",
	keynote: "Keynote",
};

export class Sessions extends sf.array("Sessions", Session) {}

export class Day extends sf.object("Day", {
	sessions: sf.required(Sessions, {
		metadata: {
			description: "The sessions scheduled on this day.",
		},
	}),
}) {}

export class Days extends sf.array("Days", Day) {}

export class Conference extends sf.object("Conference", {
	name: sf.string,
	sessions: sf.required(Sessions, {
		metadata: {
			description:
				"These sessions are not scheduled yet. The user (or AI agent) can move them to a specific day.",
		},
	}),
	days: Days,
}) {}
