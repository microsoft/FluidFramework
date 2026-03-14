/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mainTsx } from "./sharedFiles";
import type { TutorialModule } from "./types";

const stylesCss = `body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  margin: 0;
  padding: 16px;
  background: #f5f5f5;
}

.todo-container {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
}

.todo-container > h3 {
  width: 100%;
  text-align: center;
  color: #666;
  margin: 0 0 4px;
}

.todo-app {
  max-width: 500px;
  flex: 1;
  min-width: 260px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.todo-header {
  margin: 0 0 16px;
  color: #333;
}

.todo-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.todo-item.completed span {
  text-decoration: line-through;
  color: #999;
}

.add-form {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.add-form input[type="text"] {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.add-button {
  background: #0078d4;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.add-button:hover {
  background: #106ebe;
}

.stats {
  margin-top: 12px;
  color: #666;
  font-size: 13px;
}
`;

// --- Reusable code fragments for composing step files ---

const importsBase = `import React from "react";`;

const importsWithSchema = `import React from "react";
import { SchemaFactory } from "fluid-framework";`;

const importsWithTree = `import React from "react";
import { SchemaFactory, TreeViewConfiguration, createIndependentTreeBeta } from "fluid-framework";`;

const importsWithTreeAndEvents = `import React from "react";
import { SchemaFactory, TreeViewConfiguration, Tree, createIndependentTreeBeta } from "fluid-framework";`;

const schemaBlock = `
const sf = new SchemaFactory("todo-app");

const TodoItem = sf.object("TodoItem", {
  title: sf.string,
  completed: sf.boolean,
});

const TodoList = sf.object("TodoList", {
  title: sf.string,
  items: sf.array(TodoItem),
});`;

const treeSetupBlock = `
const tree = createIndependentTreeBeta();
const view = tree.viewWith(new TreeViewConfiguration({ schema: TodoList }));
view.initialize({
  title: "My Todos",
  items: [
    { title: "Learn SharedTree schema", completed: true },
    { title: "Build a todo app", completed: false },
    { title: "Add reactive updates", completed: false },
  ],
});`;

const todoListRendering = `
  return (
    <div className="todo-app">
      <h2 className="todo-header">{todoList.title}</h2>
      <ul className="todo-list">
        {todoList.items.map((item, i) => (
          <li
            key={i}
            className={\`todo-item \${item.completed ? "completed" : ""}\`}
          >
            <input type="checkbox" checked={item.completed} readOnly />
            <span>{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );`;

// --- Shared scaffold files for every step ---

const scaffoldFiles = {
	"/main.tsx": mainTsx,
	"/styles.css": stylesCss,
};

export const sharedTreeTutorial: TutorialModule = {
	id: "shared-tree-todo",
	title: "SharedTree Todo App",
	description:
		"Build a todo list with SharedTree \u2014 learn schema design, array operations, and reactive updates.",
	difficulty: "Intermediate",
	dependencies: {
		"fluid-framework": "^2.90.0",
		react: "^18.3.1",
		"react-dom": "^18.3.1",
	},
	steps: [
		{
			id: "define-todo-schema",
			title: "Step 1: Define the Todo Schema",
			description:
				"Define a schema for a todo application. You need a `TodoItem` with `title` (string) and `completed` (boolean) fields, and a `TodoList` with `title` (string) and `items` (array of TodoItem).",
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsBase}

// TODO: Import SchemaFactory from "fluid-framework"

// TODO: Create a SchemaFactory with namespace "todo-app"

// TODO: Define TodoItem with sf.object():
//   const TodoItem = sf.object("TodoItem", { title: sf.string, completed: sf.boolean });

// TODO: Define TodoList with sf.object():
//   const TodoList = sf.object("TodoList", { title: sf.string, items: sf.array(TodoItem) });

export default function App() {
  return (
    <div className="todo-app">
      <h2>Todo App</h2>
      <p>Start by defining your schema above!</p>
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				'Import: `import { SchemaFactory } from "fluid-framework";`',
				'Create factory: `const sf = new SchemaFactory("todo-app");`',
				'Define TodoItem: `const TodoItem = sf.object("TodoItem", { title: sf.string, completed: sf.boolean });`',
				'Define TodoList: `const TodoList = sf.object("TodoList", { title: sf.string, items: sf.array(TodoItem) });`',
			],
			validationPatterns: [
				{
					label: "Import SchemaFactory",
					pattern:
						"import\\s*\\{[^}]*SchemaFactory[^}]*\\}\\s*from\\s*[\"']fluid-framework[\"']",
				},
				{
					label: "Define TodoItem with title and completed",
					pattern: "sf\\.(object|objectRecursive)\\s*\\(\\s*[\"']TodoItem[\"']",
				},
				{
					label: "Define TodoList with items array",
					pattern: "sf\\.(object|objectRecursive)\\s*\\(\\s*[\"']TodoList[\"']",
				},
				{
					label: "Use sf.array for items",
					pattern: "sf\\.array\\s*\\(\\s*TodoItem\\s*\\)",
				},
			],
			solution: `${importsWithSchema}
${schemaBlock}

export default function App() {
  return (
    <div className="todo-app">
      <h2>Todo App</h2>
      <p>Schema defined! Move to the next step.</p>
    </div>
  );
}
`,
		},
		{
			id: "create-initialize",
			title: "Step 2: Create and Initialize the Tree",
			description:
				"Create an in-memory SharedTree with `createIndependentTreeBeta()` and initialize it with a TodoList containing some sample todo items. First call `createIndependentTreeBeta()` to get a tree, then `tree.viewWith()` with your schema config to get a view. Pass plain objects to `view.initialize()` \u2014 SharedTree automatically matches them to your schema.",
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `import React from "react";
import { SchemaFactory, TreeViewConfiguration } from "fluid-framework";
${schemaBlock}

// TODO: Add createIndependentTreeBeta to your import from "fluid-framework"

// TODO: Create a tree and then a view:
//   const tree = createIndependentTreeBeta();
//   const view = tree.viewWith(new TreeViewConfiguration({ schema: TodoList }));

// TODO: Initialize the view with sample data using plain objects:
// view.initialize({
//   title: "My Todos",
//   items: [
//     { title: "Learn SharedTree schema", completed: true },
//     { title: "Build a todo app", completed: false },
//     { title: "Add reactive updates", completed: false },
//   ],
// });

export default function App() {
  return (
    <div className="todo-app">
      <h2>Todo App</h2>
      <p>Create and initialize your tree above!</p>
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				'Add to your import: `import { SchemaFactory, TreeViewConfiguration, createIndependentTreeBeta } from "fluid-framework";`',
				"Create tree: `const tree = createIndependentTreeBeta();`",
				"Create view: `const view = tree.viewWith(new TreeViewConfiguration({ schema: TodoList }));`",
				'Initialize with plain objects: `view.initialize({ title: "My Todos", items: [...] })`',
			],
			validationPatterns: [
				{
					label: "Import createIndependentTreeBeta",
					pattern:
						"import\\s*\\{[^}]*createIndependentTreeBeta[^}]*\\}\\s*from\\s*[\"']fluid-framework",
				},
				{
					label: "Create tree",
					pattern: "createIndependentTreeBeta\\s*\\(",
				},
				{
					label: "Create view with viewWith",
					pattern: "\\.viewWith\\s*\\(",
				},
				{
					label: "Initialize with sample data",
					pattern: "view\\.initialize\\s*\\(",
				},
			],
			solution: `${importsWithTree}
${schemaBlock}
${treeSetupBlock}

export default function App() {
  return (
    <div className="todo-app">
      <h2>Todo App</h2>
      <p>Tree created! Move to the next step.</p>
    </div>
  );
}
`,
		},
		{
			id: "read-display",
			title: "Step 3: Read and Display Todos",
			description:
				"Read data from the SharedTree and display it. Iterate over `view.root.items` to render each todo item with its title and completion status.",
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsWithTree}
${schemaBlock}
${treeSetupBlock}

export default function App() {
  const todoList = view.root;

  return (
    <div className="todo-app">
      <h2 className="todo-header">{todoList.title}</h2>
      {/* TODO: Create a <ul className="todo-list"> and map over todoList.items */}
      {/* For each item, render a <li> with:
          - className: "todo-item" (add "completed" class if item.completed)
          - A checkbox showing item.completed (read-only for now)
          - A <span> with item.title
      */}
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				'Use: `<ul className="todo-list">{todoList.items.map((item, i) => ...)}</ul>`',
				"Each list item: `<li key={i} className={...}>`",
				'Add checkbox: `<input type="checkbox" checked={item.completed} readOnly />`',
				"Add title: `<span>{item.title}</span>`",
			],
			validationPatterns: [
				{
					label: "Map over todoList.items",
					pattern: "(todoList\\.items|view\\.root\\.items)\\.(map|forEach)",
				},
				{
					label: "Render item title",
					pattern: "item\\.title",
				},
				{
					label: "Render checkbox with completed status",
					pattern: "item\\.completed",
				},
			],
			solution: `${importsWithTree}
${schemaBlock}
${treeSetupBlock}

export default function App() {
  const todoList = view.root;
${todoListRendering}
}
`,
		},
		{
			id: "add-editing",
			title: "Step 4: Add Editing \u2014 Toggle and Add Items",
			description:
				"Make the todos interactive! Toggle `item.completed` when a checkbox is clicked, and add a form to insert new items using `todoList.items.insertAtEnd()`. Pass a plain object to `insertAtEnd()` \u2014 SharedTree matches it to the TodoItem schema automatically.",
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsWithTree}
${schemaBlock}
${treeSetupBlock}

export default function App() {
  const todoList = view.root;
  const [newTitle, setNewTitle] = React.useState("");

  // TODO: Add a handleToggle function that flips item.completed
  // e.g., item.completed = !item.completed;

  // TODO: Add a handleAdd function that:
  // 1. Checks newTitle is not empty
  // 2. Calls todoList.items.insertAtEnd({ title: newTitle, completed: false })
  // 3. Clears the input

  return (
    <div className="todo-app">
      <h2 className="todo-header">{todoList.title}</h2>
      <ul className="todo-list">
        {todoList.items.map((item, i) => (
          <li
            key={i}
            className={\`todo-item \${item.completed ? "completed" : ""}\`}
          >
            {/* TODO: Make checkbox onChange call handleToggle */}
            <input type="checkbox" checked={item.completed} readOnly />
            <span>{item.title}</span>
          </li>
        ))}
      </ul>
      {/* TODO: Add a form with text input and "Add" button */}
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				"Toggle: `const handleToggle = (item) => { item.completed = !item.completed; };`",
				"On checkbox: `onChange={() => handleToggle(item)}` \u2014 and remove `readOnly`",
				"Insert: `todoList.items.insertAtEnd({ title: newTitle, completed: false });`",
				'Form: `<div className="add-form"><input value={newTitle} onChange={...} /><button onClick={handleAdd}>Add</button></div>`',
			],
			validationPatterns: [
				{
					label: "Toggle completed",
					pattern: "item\\.completed\\s*=\\s*!\\s*item\\.completed",
				},
				{
					label: "insertAtEnd to add new items",
					pattern: "insertAtEnd\\s*\\(",
				},
				{
					label: "Text input for new todo",
					pattern: '<input[^>]*type\\s*=\\s*["\']text["\']',
				},
			],
			solution: `${importsWithTree}
${schemaBlock}
${treeSetupBlock}

export default function App() {
  const todoList = view.root;
  const [newTitle, setNewTitle] = React.useState("");

  const handleToggle = (item: typeof TodoItem.Type) => {
    item.completed = !item.completed;
  };

  const handleAdd = () => {
    if (newTitle.trim() === "") return;
    todoList.items.insertAtEnd(
      { title: newTitle.trim(), completed: false }
    );
    setNewTitle("");
  };

  return (
    <div className="todo-app">
      <h2 className="todo-header">{todoList.title}</h2>
      <ul className="todo-list">
        {todoList.items.map((item, i) => (
          <li
            key={i}
            className={\`todo-item \${item.completed ? "completed" : ""}\`}
          >
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => handleToggle(item)}
            />
            <span>{item.title}</span>
          </li>
        ))}
      </ul>
      <div className="add-form">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new todo..."
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button className="add-button" onClick={handleAdd}>
          Add
        </button>
      </div>
      <div className="stats">
        {todoList.items.filter((item) => item.completed).length} of{" "}
        {todoList.items.length} completed
      </div>
    </div>
  );
}
`,
		},
		{
			id: "reactive-updates",
			title: "Step 5: Two-Client Sync",
			description:
				'Now for the magic of Fluid! Extract a `TodoPanel` component from your App, add `Tree.on(view.root, "treeChanged", callback)` to subscribe to changes, and render **two** panels side by side. Both share the same SharedTree, so when either client toggles or adds a todo, both update instantly. This simulates the multi-client experience.',
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsWithTreeAndEvents}
${schemaBlock}
${treeSetupBlock}

// TODO: Extract a TodoPanel component that accepts a { title: string } prop.
// Move the todo rendering logic here and add Tree.on for reactivity:
//   1. Use React.useState + React.useEffect with Tree.on(view.root, "treeChanged", ...)
//      to trigger re-renders when the tree changes
//   2. Include the todo list, toggle, add form, and stats

export default function App() {
  return (
    <div className="todo-container">
      <h3>Both panels share the same SharedTree!</h3>
      {/* TODO: Render TWO TodoPanel components with different titles */}
      {/* e.g., "Client A" and "Client B" */}
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				"Create `function TodoPanel({ title }: { title: string })` and move the todo UI into it",
				'Subscribe: `const unsubscribe = Tree.on(view.root, "treeChanged", () => setTick((t) => t + 1));`',
				"Cleanup: `return unsubscribe;` inside the useEffect",
				'Render two panels: `<TodoPanel title="Client A" />` and `<TodoPanel title="Client B" />`',
			],
			validationPatterns: [
				{
					label: 'Tree.on subscription with "treeChanged"',
					pattern:
						'Tree\\.on\\s*\\(\\s*view\\.root\\s*,\\s*["\']treeChanged["\']',
				},
				{
					label: "useEffect for subscription",
					pattern: "useEffect",
				},
				{
					label: "TodoPanel component defined",
					pattern: "function\\s+TodoPanel",
				},
				{
					label: "Two TodoPanel instances rendered",
					pattern: "<TodoPanel[^/]*/>.*<TodoPanel",
				},
			],
			solution: `${importsWithTreeAndEvents}
${schemaBlock}
${treeSetupBlock}

function TodoPanel({ title }: { title: string }) {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    const unsubscribe = Tree.on(view.root, "treeChanged", () => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const todoList = view.root;
  const [newTitle, setNewTitle] = React.useState("");

  const handleToggle = (item: typeof TodoItem.Type) => {
    item.completed = !item.completed;
  };

  const handleAdd = () => {
    if (newTitle.trim() === "") return;
    todoList.items.insertAtEnd(
      { title: newTitle.trim(), completed: false }
    );
    setNewTitle("");
  };

  return (
    <div className="todo-app">
      <h2 className="todo-header">{title}</h2>
      <ul className="todo-list">
        {todoList.items.map((item, i) => (
          <li
            key={i}
            className={\`todo-item \${item.completed ? "completed" : ""}\`}
          >
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => handleToggle(item)}
            />
            <span>{item.title}</span>
          </li>
        ))}
      </ul>
      <div className="add-form">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new todo..."
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button className="add-button" onClick={handleAdd}>
          Add
        </button>
      </div>
      <div className="stats">
        {todoList.items.filter((item) => item.completed).length} of{" "}
        {todoList.items.length} completed
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="todo-container">
      <h3>Both panels share the same SharedTree!</h3>
      <TodoPanel title="Client A" />
      <TodoPanel title="Client B" />
    </div>
  );
}
`,
		},
	],
};
