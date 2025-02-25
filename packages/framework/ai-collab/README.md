# @fluidframework/ai-collab

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
import { SchemaFactory, type treeView } from "@fluidframework/tree";

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
import { aiCollab, DebugEvent } from "@fluidframework/ai-collab/alpha";
import { PlannerAppState } from "./types.ts"
// This is not a real file, this is meant to represent how you initialize your app data.
import { initializeAppState } from "./yourAppInitializationFile.ts"

//  --------- File name: "app.ts" ---------

// Initialize your Fluid app state somehow
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
const response = await aiCollab({
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
		limiters: {
			maxModelCalls: 25
		}
		planningStep: true,
		finalReviewStep: true,
		debugEventLogHandler: (event: DebugEvent) => {console.log(event);}
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
	 - `debugEvents.ts`: Types and helper functions for `DebugEvent`'s emitted to the callback provided to the aiCollab's `debugEventLogHandler`
- `/implicit-strategy`: The original implicit strategy, currently not used under the exported aiCollab API surface.

## Debug Events
This package allows users to consume `DebugEvents` that can be very helpful in understanding what's going on internally and debugging potential issues.
Users can consume these events by passing in a `debugEventLogHandler` when calling the `aiCollab()` function:
```ts
aiCollab({
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
	limiters: {
		maxModelCalls: 25
	}
	planningStep: true,
	finalReviewStep: true,
	debugEventLogHandler: (event: DebugEvent) => {console.log(event);} // This should be your debug event log handler
});

```

All debug events implement the `DebugEvent` interface. Some also implement `EventFlowDebugEvent`, which lets them mark a progress point in a specific logic flow within a given execution of `aiCollab()`.

### Event flow Overview
To see detailed information about each event, please read their cooresponding [tsdoc](./src/explicit-strategy/debugEvents.ts#L46)

1. **Core Event Loop** - The start and end of a single execution of aiCollab.
	- Events:
		1. **Core Event Loop Started**
		1. **Core Event Loop Completed**
2. **Generate Planning Prompt** - The event flow for producing an initial LLM generated plan to assist the LLM with creating edits to the users Shared Tree.
	- Events
		1. **Generate Planning Prompt Started**
			- Child `DebugEvent`'s triggered:
				1. **Llm Api Call** - An event detailing the raw api request to the LLM client.
		1. **Generate Planning Prompt Completed**
3. **Generate Tree Edit** - The event flow for generating an edit to the users Shared Tree to further complete the users request.
	- Events:
		1. **Generate Tree Edit Started**
			- Child `DebugEvent`'s triggered:
				1. **Llm Api Call** - An event detailing the raw api request to the LLM client.
		1. **Generate Tree Edit Completed**
		1. **Apply Edit Success** OR **Apply Edit Failure** - The outcome of applying the LLM generated tree edit.
4. **Final Review** - The event flow for asking the LLM to complete a final review of work it has completed and confirming if the users request has been completed. If the LLM is not satisfied, the **Generate Tree Edit** loop will start again.
	- Events:
		- **Final Review Started**
			- Child `DebugEvent`'s triggered:
				1. **Llm Api Call** - An event detailing the raw api request to the LLM client.
		- **Final Review Completed**


### Using Trace Id's
Debug Events in ai-collab have two different types of trace id's:
- `traceId`: This field exists on all debug events and can be used to correlate all debug events that happened in a single execution of `aiCollab()`. Sorting the events by timestamp will show the proper chronological order of the events. Note that the events should already be emitted in chronological order.
- `eventFlowTraceId`: this field exists on all `EventFlowDebugEvents` and can be used to correlate all events from a particular event flow. Additionally all LLM api call events will contain the `eventFlowTraceId` field as well as a `triggeringEventFlowName` so you can link LLM API calls to a particular event flow.


## Known Issues & limitations

1. Union types for a TreeNode are not present when generating App Schema. This will require extracting a field schema instead of TreeNodeSchema when passed a non root node.
1. Optional roots are not allowed, This is because if you pass undefined as your treeNode to the API, we cannot disambiguate whether you passed the root or not.
1. Primitive root nodes are not allowed to be passed to the API. You must use an object or array as your root.
1. Optional nodes are not supported -- when we use optional nodes, the OpenAI API returns an error complaining that the structured output JSON schema is invalid. I have introduced a fix that should work upon manual validation of the json schema, but there looks to be an issue with their API. I have filed a ticket with OpenAI to address this
1. The current scheme does not allow manipulation of arrays of primitive values because you cannot refer to them. We could accomplish this via a path (probably JSON Pointer or JSONPath) from a possibly-null objectId, or wrap arrays in an identified object.
1. Only 100 object fields total are allowed by OpenAI right now, so larger schemas will fail faster if we have a bunch of schema types generated for type-specific edits.
1. We don't support nested arrays yet.
1. Handle 429 rate limit error from OpenAI API.
1. Top level arrays are not supported with current DSL.
1. Structured Output fails when multiple schema types have the same first field name (e.g. id: sf.identifier on multiple types).
1. Your Application's SharedTree Schema must have no more than 4 levels of nesting due to OpenAI structured output limitations. (4 because we add an extra layer of nesting internally)


<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
    -   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is not supported.
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

### Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 5.0](https://github.com/microsoft/TypeScript/issues/51909) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).
Node10 resolution is not supported as it does not support Fluid Framework's API structuring pattern that is used to distinguish stable APIs from those that are in development.

### Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for the cases listed below.
    This is done to accommodate some workflows without good ES Module support.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year after notice of the change is posted here.

    -   Testing with Jest (which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
