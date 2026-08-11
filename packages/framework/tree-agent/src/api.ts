/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ImplicitFieldSchema, TreeNode } from "@fluidframework/tree";
// These are used for doc links
import type {
	FactoryContentObject,
	ReadableField,
	TreeBranchAlpha,
	TreeViewAlpha,
} from "@fluidframework/tree/alpha";

/**
 * Logger interface for logging events from tree-agent operations.
 * @alpha
 */
export interface Logger {
	/**
	 * Log a message.
	 */
	log(message: string): void;
}

/**
 * A SharedTree view for use by tree-agent operations.
 * @alpha
 * @privateRemarks This is a subset of the TreeViewAlpha functionality because if take it wholesale, it causes problems with invariance of the generic parameters.
 */
export type TreeView<TRoot extends ImplicitFieldSchema> = Pick<
	TreeViewAlpha<TRoot>,
	"root" | "fork" | "merge" | "rebaseOnto" | "schema" | "events"
> &
	TreeBranchAlpha;

/**
 * A value that is either a {@link TreeView} or a subtree within a {@link TreeView}.
 * @alpha
 */
export type ViewOrTree<TSchema extends ImplicitFieldSchema> =
	| TreeView<TSchema>
	| (ReadableField<TSchema> & TreeNode);

/**
 * The context object available to generated code when editing a tree.
 * @remarks This object is provided to JavaScript code executed by the {@link SynchronousEditor | editor} as a variable named `context`.
 * It contains the current state of the tree and utilities for creating and inspecting tree nodes.
 *
 * Use {@link createContext} to create a context.
 * @alpha
 */
export interface Context<TSchema extends ImplicitFieldSchema> {
	/**
	 * The root of the tree that can be read or modified.
	 * @remarks
	 * You can read properties and navigate through the tree starting from this root.
	 * You can also assign a new value to this property to replace the entire tree, as long as the new value is one of the types allowed at the root.
	 *
	 * Example: Read the current root with `const currentRoot = context.root;`
	 *
	 * Example: Replace the entire root with `context.root = context.create.MyRootType({ });`
	 */
	root: ReadableField<TSchema>;

	/**
	 * A collection of builder functions for creating new tree nodes.
	 * @remarks
	 * Each property on this object is named after a type in the tree schema.
	 * Call the corresponding function to create a new node of that type.
	 * Always use these builder functions when creating new nodes rather than plain JavaScript objects.
	 *
	 * Example: Create a new Person node with `context.create.Person({ name: "Alice", age: 30 })`
	 */
	create: Record<string, (input: FactoryContentObject) => TreeNode>;

	/**
	 * A collection of type-checking functions for tree nodes.
	 * @remarks
	 * Each property on this object is named after a type in the tree schema.
	 * Call the corresponding function to check if a node is of that specific type.
	 * This is useful when working with nodes that could be one of multiple types.
	 *
	 * Example: Check if a node is a Person with `if (context.is.Person(node)) { console.log(node.name); }`
	 */
	is: Record<string, <T extends TreeNode>(input: T) => input is T>;

	/**
	 * Checks if the given node is an array.
	 */
	isArray(value: unknown): boolean;

	/**
	 * Checks if the given node is a map.
	 */
	isMap(value: unknown): boolean;

	/**
	 * Returns the parent node of the given child node.
	 * @param child - The node whose parent you want to find.
	 * @returns The parent node, or `undefined` if the node is the root or is not in the tree.
	 * @remarks
	 * Example: Get the parent with `const parent = context.parent(childNode);`
	 */
	parent(child: TreeNode): TreeNode | undefined;

	/**
	 * Returns the key or index of the given node within its parent.
	 * @param child - The node whose key you want to find.
	 * @returns A string key if the node is in an object or map, or a numeric index if the node is in an array.
	 * @remarks
	 * For a node in an object, this might return a string like "firstName".
	 * For a node in an array, this might return a number like 0, 1, 2, etc.
	 *
	 * Example: `const key = context.key(childNode);`
	 */
	key(child: TreeNode): string | number;
}

/**
 * A synchronous function that executes a string of JavaScript code to perform a tree-agent edit.
 * @param tree - The tree to edit.
 * @param code - The JavaScript code that should be executed.
 * @throws Any error thrown by the executed code.
 * @remarks The code expects a variable named `context` to be in scope, which provides access to the tree and utilities for creating and inspecting nodes.
 * A context can be created for a given tree via the {@link createContext} function.
 * @example
 * ```ts
 * // A simple editor implementation that runs the provided code via a JavaScript Function.
 * new Function("context", code)(createContext(tree));
 * ```
 * @alpha
 */
export type SynchronousEditor<TSchema extends ImplicitFieldSchema> = (
	tree: ViewOrTree<TSchema>,
	code: string,
) => void;

/**
 * An asynchronous function that executes a string of JavaScript code to perform a tree-agent edit.
 * @param tree - The tree to edit.
 * @param code - The JavaScript code that should be executed.
 * @throws Any error thrown by the executed code.
 * @remarks The code expects a variable named `context` to be in scope, which provides access to the tree and utilities for creating and inspecting nodes.
 * A context can be created for a given tree via the {@link createContext} function.
 * @example
 * ```ts
 * // A simple editor implementation that runs the provided code via a JavaScript Function.
 * await new Function("context", code)(createContext(tree));
 * ```
 * @alpha
 */
export type AsynchronousEditor<TSchema extends ImplicitFieldSchema> = (
	tree: ViewOrTree<TSchema>,
	code: string,
) => Promise<void>;

/**
 * A result from a tree-agent edit attempt.
 * @alpha
 */
export interface EditResult {
	/**
	 * The type of the edit result.
	 * @remarks
	 * - `success`: The edit was successfully applied.
	 * - `editingError`: An error was thrown while parsing or executing the provided JavaScript.
	 * - `tooManyEditsError`: The model requested more than the configured number of sequential edits.
	 */
	type: "success" | "editingError" | "tooManyEditsError";

	/**
	 * A human-readable message describing the result of the edit attempt.
	 * @remarks In the case of an error, this message is appropriate to include in a model's chat history.
	 */
	message: string;
}

/**
 * Type guard for {@link EditResult}.
 */
export function isEditResult(value: unknown): value is EditResult {
	if (value === null || typeof value !== "object") {
		return false;
	}
	return (
		typeof (value as EditResult).type === "string" &&
		typeof (value as EditResult).message === "string"
	);
}

// #region Message and response types

/**
 * A system message providing context to the model.
 * @alpha
 */
export interface TreeAgentSystemMessage {
	/** Identifies the message type within a {@link TreeAgentChatMessage} array. */
	readonly role: "system";
	/** The text content of the message. */
	readonly content: string;
}

/**
 * A user message containing a query or instruction.
 * @alpha
 */
export interface TreeAgentUserMessage {
	/** Identifies the message type within a {@link TreeAgentChatMessage} array. */
	readonly role: "user";
	/** The text content of the message. */
	readonly content: string;
}

/**
 * An assistant message containing the model's text response (when no tool call is made).
 * @alpha
 */
export interface TreeAgentAssistantMessage {
	/** Identifies the message type within a {@link TreeAgentChatMessage} array. */
	readonly role: "assistant";
	/** The text content of the message. */
	readonly content: string;
}

/**
 * An assistant message requesting a tool call (e.g. to edit the tree).
 * @alpha
 */
export interface TreeAgentToolCallMessage {
	/** Identifies the message type within a {@link TreeAgentChatMessage} array. */
	readonly role: "tool_call";
	/** An optional identifier for this tool invocation, used to correlate with the result. */
	readonly toolCallId?: string;
	/** The name of the tool being called. */
	readonly toolName: string;
	/** The arguments to the tool call, as returned by the LLM. */
	readonly toolArgs: Record<string, unknown>;
}

/**
 * A tool result message containing the outcome of a tool invocation.
 * @alpha
 */
export interface TreeAgentToolResultMessage {
	/** Identifies the message type within a {@link TreeAgentChatMessage} array. */
	readonly role: "tool_result";
	/** The identifier of the tool call this result corresponds to, if one was provided. */
	readonly toolCallId?: string;
	/** The result content (e.g. the EditResult serialized as text, or the new tree state). */
	readonly content: string;
}

/**
 * A role-tagged message in a tree agent conversation.
 * @remarks The agent owns the conversation history as an array of these messages and passes them to {@link SharedTreeChatModel.invoke}.
 * @alpha
 */
export type TreeAgentChatMessage =
	| TreeAgentSystemMessage
	| TreeAgentUserMessage
	| TreeAgentAssistantMessage
	| TreeAgentToolCallMessage
	| TreeAgentToolResultMessage;

/**
 * A response from a {@link SharedTreeChatModel} after invoking it with a message history.
 * @alpha
 */
export type TreeAgentChatResponse = TreeAgentToolCallMessage | TreeAgentAssistantMessage;

// #endregion

// #region Agent interface and options

/**
 * An agent that can analyze and edit a SharedTree.
 * @remarks Created via {@link createTreeAgent}.
 * @alpha
 */
export interface TreeAgent {
	/**
	 * Process the user's prompt, potentially editing the tree in a multi-turn conversation, and return a response.
	 * @param prompt - The user's question or edit instruction.
	 * @returns The model's text response.
	 */
	message(prompt: string): Promise<string>;

	/**
	 * Unsubscribes from tree change events and releases resources held by the agent.
	 * @remarks After calling this method, the agent should not be used again.
	 */
	dispose(): void;
}

/**
 * Options for creating a tree agent via {@link createTreeAgent}.
 * @alpha
 */
export interface TreeAgentOptions<TSchema extends ImplicitFieldSchema> {
	/**
	 * Additional information about the application domain that will be included in the context provided to the {@link SharedTreeChatModel | model}.
	 */
	domainHints?: string;
	/**
	 * If supplied, generates human-readable markdown text describing the actions taken by the agent.
	 */
	logger?: Logger;
	/**
	 * Executes any generated JavaScript created by the {@link SharedTreeChatModel.editToolName | model's editing tool}.
	 * @remarks If an error is thrown while executing the code, it will be caught and the message will be forwarded to the {@link SharedTreeChatModel | model} for debugging.
	 * If this function is not provided, the generated code will be executed using a simple JavaScript eval which may not provide sufficient security guarantees for some environments.
	 * Run the code in a sandboxed environment or use a library such as SES to provide a more secure implementation — see `@fluidframework/tree-agent-ses` for a drop-in implementation.
	 */
	editor?: SynchronousEditor<TSchema> | AsynchronousEditor<TSchema>;
	/**
	 * The maximum number of sequential edits the LLM can make before we assume it's stuck in a loop.
	 */
	maximumSequentialEdits?: number;
}

/**
 * Options for {@link executeSemanticEditing}.
 * @alpha
 */
export interface ExecuteSemanticEditingOptions<TSchema extends ImplicitFieldSchema> {
	/**
	 * Executes any generated JavaScript created by the {@link SharedTreeChatModel.editToolName | model's editing tool}.
	 * @remarks If not provided, the generated code will be executed using a simple JavaScript eval.
	 */
	editor?: SynchronousEditor<TSchema> | AsynchronousEditor<TSchema>;
	/**
	 * The maximum number of sequential edits the LLM can make before we assume it's stuck in a loop.
	 */
	maximumSequentialEdits?: number;
	/**
	 * Additional information about the application domain that will be included in the generated system prompt.
	 */
	domainHints?: string;
	/**
	 * If supplied, generates human-readable markdown text describing the actions taken during execution.
	 */
	logger?: Logger;
}

// #endregion

/**
 * A plugin interface that handles tree-agent model invocations.
 * @remarks This wraps the underlying communication with an LLM.
 * See `@fluidframework/tree-agent-langchain` for a drop-in implementation based on the LangChain library.
 * @alpha
 */
export interface SharedTreeChatModel {
	/**
	 * A optional name of this chat model.
	 * @remarks If supplied, this may be used in logging or debugging information.
	 * @example "gpt-5"
	 */
	name?: string;
	/**
	 * The name of the tool that the model should use to edit the tree.
	 * @remarks If supplied, this is included in the generated system prompt so that the underlying LLM can request edits.
	 * The model should "implement" the tool by registering it with the underlying LLM API.
	 * The tool should accept an LLM-generated JavaScript function as input.
	 * If not supplied, the model cannot be used for semantic editing.
	 */
	editToolName?: string;
	/**
	 * Invoke the model with the given message history and return a single response.
	 * @remarks This is the stateless API. The model should not maintain any internal message history;
	 * all context is provided via the `history` parameter.
	 * Implementations should convert the {@link TreeAgentChatMessage} array to the underlying LLM's
	 * message format, invoke the LLM, and return either a {@link TreeAgentToolCallMessage} (if the model
	 * wants to call a tool) or a {@link TreeAgentAssistantMessage} (if the model is done).
	 */
	invoke(history: readonly TreeAgentChatMessage[]): Promise<TreeAgentChatResponse>;
}
