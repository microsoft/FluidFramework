## Description

The ai-collab client library makes adding complex, human-like collaboration with LLM's built directly in your application as simple as one function call. Simply pass your SharedTree and ask AI to collaborate. For example,
- Task Management App: "Reorder this list of tasks in order from least to highest complexity."
- Job Board App: "Create a new job listing and add it to this job board"
- Calender App: "Manage my calender to slot in a new 2:30 appointment"

## Usage

### Your SharedTree types file

This file is where we define the types of our task management application's SharedTree data
```ts
//  --------- File name: "types.ts" ---------
import { SchemaFactory } from "@fluidframework/tree";

const sf = new SchemaFactory("ai-collab-sample-application");

export class Task extends sf.object("Task", {
	title: sf.required(sf.string, {
		metadata: { description: `The title of the task` },
	}),
	id: sf.identifier,
	description: sf.required(sf.string, {
		metadata: { description: `The description of the task` },
	}),
	priority: sf.required(sf.string, {
		metadata: { description: `The priority of the task in three levels, "low", "medium", "high"` },
	}),
	complexity: sf.required(sf.number, {
		metadata: { description: `The complexity of the task as a fibonacci number` },
	}),
	status: sf.required(sf.string, {
		metadata: { description: `The status of the task as either "todo", "in-progress", or "done"` },
	}),
	assignee: sf.required(sf.string, {
		metadata: { description: `The name of the tasks assignee e.g. "Bob" or "Alice"` },
	}),
}) {}

export class TaskList extends sf.array("TaskList", SharedTreeTask) {}

export class Engineer extends sf.object("Engineer", {
	name: sf.required(sf.string, {
		metadata: { description: `The name of an engineer whom can be assigned to a task` },
	}),
	id: sf.identifier,
	skills: sf.required(sf.string, {
		metadata: { description: `A description of the engineers skills which influence what types of tasks they should be assigned to.` },
	}),
	maxCapacity: sf.required(sf.number, {
		metadata: { description: `The maximum capacity of tasks this engineer can handle measured in in task complexity points.` },
	}),
}) {}

export class EngineerList extends sf.array("EngineerList", SharedTreeEngineer) {}

export class TaskGroup extends sf.object("TaskGroup", {
	description: sf.required(sf.string, {
		metadata: { description: `The description of the task group, which is a collection of tasks and engineers that can be assigned to said tasks.` },
	}),
	id: sf.identifier,
	title: sf.required(sf.string, {
		metadata: { description: `The title of the task group.` },
	}),
	tasks: sf.required(SharedTreeTaskList, {
		metadata: { description: `The lists of tasks within this task group.` },
	}),
	engineers: sf.required(SharedTreeEngineerList, {
		metadata: { description: `The lists of engineers within this task group which can be assigned to tasks.` },
	}),
}) {}

export class TaskGroupList extends sf.array("TaskGroupList", SharedTreeTaskGroup) {}

export class PlannerAppState extends sf.object("PlannerAppState", {
	taskGroups: sf.required(SharedTreeTaskGroupList, {
		metadata: { description: `The list of task groups that are being managed by this task management application.` },
	}),
}) {}
```

### Example 1: Collaborate with AI

```ts
import { aiCollab } from "@fluid-experimental/ai-collab";
import { PlannerAppState } from "./types.ts"
// This is not a real file, this is meant to represent how you initialize your app data.
import { initializeAppState } from "./yourAppInitializationFile.ts"

//  --------- File name: "app.ts" ---------

// Initialize your app state somehow
const appState: PlannerAppState = initializeAppState({
		taskGroups: [
		{
			title: "My First Task Group",
			description: "Placeholder for first task group",
			tasks: [
				{
					assignee: "Alice",
					title: "Task #1",
					description:
						"This is the first Sample task.",
					priority: "low",
					complexity: 1,
					status: "todo",
				},
			],
			engineers: [
				{
					name: "Alice",
					maxCapacity: 15,
					skills:
						"Senior engineer capable of handling complex tasks. Versed in most languages",
				},
				{
					name: "Charlie",
					maxCapacity: 7,
					skills: "Junior engineer capable of handling simple tasks. Versed in Node.JS",
				},
			],
		},
	],
})

// Typically, the user would input this through a UI form/input of some sort.
const userAsk = "Update the task group description to be a about creating a new Todo list application. Create a set of tasks to accomplish this and assign them to the available engineers. Keep in mind the max capacity of each engineer as you assign tasks."

// Collaborate with AI one function call.
const response = await aiCollab<typeof PlannerAppState>({
		openAI: {
			client: new OpenAI({
				apiKey: OPENAI_API_KEY,
			}),
			modelName: "gpt-4o",
		},
		treeNode: view.root.taskGroups[0],
		prompt: {
			systemRoleContext:
				"You are a manager that is helping out with a project management tool. You have been asked to edit a group of tasks.",
			userAsk: userAsk,
		},
		planningStep: true,
		finalReviewStep: true,
		dumpDebugLog: true,
	});

if (response.status === 'sucess') {
	// Render the UI view of your task groups.
	window.alert(`The AI has successfully completed your request.`);
} else {
	window.alert(`Something went wrong! response status: ${response.status}, error message: ${response.errorMessage}`);
}


```

Once the `aiCollab` function call is initiated, an LLM will immediately begin attempting to make changes to your Shared Tree using the provided user prompt, the types of your SharedTree and the provided app guidance. The LLM produces multiple changes, in a loop asynchronously. Meaning, you will immediatley see changes if your UI's render loop is connected to your SharedTree App State.

### Example 2: Collaborate with AI onto a branched state and let the user merge the review and merge the branch back manually
- **Coming Soon**


## Folder Structure

- `/explicit-strategy`: The new explicit strategy, utilizing the prototype built during the fall FHL, with a few adjustments.
     - `agentEditReducer`: This file houses the logic for taking in a `TreeEdit`, which the LLM produces, and applying said edit to the
     -  actual SharedTree.
     - `agentEditTypes.ts`: The types of edits an LLM is prompted to produce in order to modify a SharedTree.
     - `idGenerator.ts`: `A manager for producing and mapping simple id's in place of UUID hashes when generating prompts for an LLM
     - `jsonTypes.ts`: utility JSON related types used in parsing LLM response and generating LLM prompts.
     - `promptGeneration.ts`: Logic for producing the different types of prompts sent to an LLM in order to edit a SharedTree.
     - `typeGeneration.ts`: Generates serialized(/able) representations of a SharedTree Schema which is used within prompts and the generated of the structured output JSON schema
     - `utils.ts`: Utilities for interacting with a SharedTree
- `/implicit-strategy`: The original implicit strategy, currently not used under the exported aiCollab API surface.

## Known Issues & limitations

1. Union types for a TreeNode are not present when generating App Schema. This will require extracting a field schema instead of TreeNodeSchema when passed a non root node.
1. The Editing System prompt & structured out schema currently provide array related edits even when there are no arrays. This forces you to have an array in your schema to produce a valid json schema
1. Optional roots are not allowed, This is because if you pass undefined as your treeNode to the API, we cannot disambiguate whether you passed the root or not.
1. Primitive root nodes are not allowed to be passed to the API. You must use an object or array as your root.
1. Optional nodes are not supported -- when we use optional nodes, the OpenAI API returns an error complaining that the structured output JSON schema is invalid. I have introduced a fix that should work upon manual validation of the json schema, but there looks to be an issue with their API. I have filed a ticket with OpenAI to address this
1. The current scheme does not allow manipulation of arrays of primitive values because you cannot refer to them. We could accomplish this via a path (probably JSON Pointer or JSONPath) from a possibly-null objectId, or wrap arrays in an identified object.
1. Only 100 object fields total are allowed by OpenAI right now, so larger schemas will fail faster if we have a bunch of schema types generated for type-specific edits.
1. We don't support nested arrays yet.
1. Handle 429 rate limit error from OpenAI.
1. Top level arrays are not supported with current DSL.
1. Structured Output fails when multiple schema types have the same first field name (e.g. id: sf.identifier on multiple types).
1. Pass descriptions from schema metadata to the generated TS types that we put in the prompt.
