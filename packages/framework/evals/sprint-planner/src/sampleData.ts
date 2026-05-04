/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

interface SprintBoardData {
	sprintName: string;
	workItems: {
		title: string;
		description?: string;
		status: string;
		priority: string;
		assignee?: string;
		storyPoints?: number;
	}[];
	team: {
		name: string;
		capacity: number;
	}[];
}

/**
 * Returns sample data for a sprint board.
 */
export function sampleSprintBoard(): SprintBoardData {
	return {
		sprintName: "Sprint 24",
		workItems: [
			{
				title: "Set up CI/CD pipeline",
				description: "Configure GitHub Actions for automated builds and deployments.",
				status: "done",
				priority: "critical",
				assignee: "Alice",
				storyPoints: 5,
			},
			{
				title: "Design database schema",
				description: "Create the initial database schema for user management.",
				status: "in-review",
				priority: "high",
				assignee: "Bob",
				storyPoints: 8,
			},
			{
				title: "Implement user authentication",
				description: "Add login and registration endpoints with JWT tokens.",
				status: "in-progress",
				priority: "high",
				assignee: "Alice",
				storyPoints: 8,
			},
			{
				title: "Write API documentation",
				description: "Document all REST API endpoints using OpenAPI spec.",
				status: "todo",
				priority: "medium",
				storyPoints: 3,
			},
			{
				title: "Add unit tests for auth module",
				status: "todo",
				priority: "medium",
				assignee: "Charlie",
				storyPoints: 5,
			},
			{
				title: "Fix responsive layout on mobile",
				description: "Several pages break on screen widths below 768px.",
				status: "todo",
				priority: "low",
				storyPoints: 2,
			},
		],
		team: [
			{ name: "Alice", capacity: 13 },
			{ name: "Bob", capacity: 10 },
			{ name: "Charlie", capacity: 8 },
		],
	};
}
