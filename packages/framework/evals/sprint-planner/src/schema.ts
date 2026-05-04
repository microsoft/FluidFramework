/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";
import { llmDefault } from "@fluidframework/tree-agent/alpha";

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.sprint-planner");

/**
 * A work item on the sprint board.
 */
export class WorkItem extends sf.object(
	"WorkItem",
	{
		id: sf.identifier,
		title: sf.required(sf.string, {
			metadata: {
				description: "The title of the work item.",
			},
		}),
		description: sf.optional(sf.string, {
			metadata: {
				description: "A detailed description of the work item.",
			},
		}),
		status: sf.required(sf.string, {
			metadata: {
				description:
					"The current status of the work item. Must be one of: 'todo', 'in-progress', 'in-review', or 'done'.",
			},
		}),
		priority: sf.required(sf.string, {
			metadata: {
				description:
					"The priority of the work item. Must be one of: 'critical', 'high', 'medium', or 'low'.",
			},
		}),
		assignee: sf.optional(sf.string, {
			metadata: {
				description: "The name of the team member assigned to this work item.",
			},
		}),
		storyPoints: sf.optional(sf.number, {
			metadata: {
				description:
					"The estimated effort in story points. Should be a Fibonacci number: 1, 2, 3, 5, 8, or 13.",
			},
		}),
		created: sf.optional(sf.number, {
			metadata: {
				description: "The timestamp when this work item was created.",
				custom: { [llmDefault]: () => Date.now() },
			},
		}),
	},
	{
		metadata: {
			description: "A work item representing a task or story on the sprint board.",
		},
	},
) {}

/**
 * A team member who can be assigned work items.
 */
export class TeamMember extends sf.object(
	"TeamMember",
	{
		name: sf.required(sf.string, {
			metadata: {
				description: "The name of the team member.",
			},
		}),
		capacity: sf.required(sf.number, {
			metadata: {
				description: "The number of story points this team member can handle per sprint.",
			},
		}),
	},
	{
		metadata: {
			description: "A team member who participates in the sprint.",
		},
	},
) {}

/**
 * The root sprint board containing work items and team members.
 */
export class SprintBoard extends sf.object(
	"SprintBoard",
	{
		sprintName: sf.required(sf.string, {
			metadata: {
				description: "The name of the current sprint.",
			},
		}),
		workItems: sf.required(sf.array("WorkItems", WorkItem), {
			metadata: {
				description: "The list of work items in this sprint.",
			},
		}),
		team: sf.required(sf.array("Team", TeamMember), {
			metadata: {
				description: "The team members participating in this sprint.",
			},
		}),
	},
	{
		metadata: {
			description:
				"A sprint board that organizes work items and team members for an agile sprint.",
		},
	},
) {}
