/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createTreeCallPattern,
	createTreeImportPattern,
	importsBase,
	importsWithSchema,
	importsWithTree,
	importsWithTreeAndEvents,
	initializePattern,
	mainTsx,
	schemaFactoryImportPattern,
	treeViewConfigPattern,
	useEffectPattern,
	viewWithPattern,
} from "./sharedFiles";
import type { TutorialModule } from "./types";

const stylesCss = `body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  margin: 0;
  padding: 16px;
  background: #f5f5f5;
}

.dice-container {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  justify-content: center;
}

.dice-panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-align: center;
  min-width: 200px;
}

.dice-face {
  font-size: 80px;
  margin: 16px 0;
  line-height: 1;
}

.roll-button {
  background: #0078d4;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 32px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.roll-button:hover {
  background: #106ebe;
}

h2 {
  margin: 0 0 8px;
  color: #333;
}

h3 {
  text-align: center;
  color: #666;
  margin-bottom: 16px;
}
`;

// --- Tutorial-specific code fragments ---

const schemaBlock = `
const sf = new SchemaFactory("dice-roller");

const Dice = sf.object("Dice", { value: sf.number });`;

const treeSetupBlock = `
const tree = createIndependentTreeBeta();
const view = tree.viewWith(new TreeViewConfiguration({ schema: Dice }));
view.initialize({ value: 1 });`;

const diceFacesBlock = `
const diceFaces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];`;

const diceViewWithRoll = `
function DiceView() {
  const value = view.root.value;

  const roll = () => {
    view.root.value = Math.floor(Math.random() * 6) + 1;
  };

  return (
    <div className="dice-panel">
      <div className="dice-face">{diceFaces[value - 1]}</div>
      <p>Value: {value}</p>
      <button className="roll-button" onClick={roll}>
        Roll
      </button>
    </div>
  );
}`;

// --- Shared scaffold files for every step ---

const scaffoldFiles = {
	"/main.tsx": mainTsx,
	"/styles.css": stylesCss,
};

export const diceRollerTutorial: TutorialModule = {
	id: "dice-roller",
	title: "Dice Roller",
	description:
		"Build a collaborative dice roller that syncs between two views using SharedTree \u2014 the core Fluid DDS.",
	difficulty: "Beginner",
	dependencies: {
		"fluid-framework": "^2.90.0",
		react: "^18.3.1",
		"react-dom": "^18.3.1",
	},
	steps: [
		{
			id: "define-schema",
			title: "Step 1: Define Your Schema",
			description:
				"Every Fluid application starts with a schema. You'll use `SchemaFactory` to define a `Dice` object with a `value` field. The schema tells SharedTree the shape of your data and enables type-safe access.",
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsBase}

// TODO: Import SchemaFactory from "fluid-framework"

// TODO: Create a SchemaFactory instance with a unique namespace
// e.g., const sf = new SchemaFactory("dice-roller");

// TODO: Define a Dice schema using sf.object()
// e.g., const Dice = sf.object("Dice", { value: sf.number });

export default function App() {
  return (
    <div>
      <h2>Dice Roller</h2>
      <p>Start by defining your schema above!</p>
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				'Import SchemaFactory: `import { SchemaFactory } from "fluid-framework";`',
				'Create a factory: `const sf = new SchemaFactory("dice-roller");`',
				'Define the schema: `const Dice = sf.object("Dice", { value: sf.number });`',
			],
			validationPatterns: [
				schemaFactoryImportPattern,
				{
					label: "Create SchemaFactory instance",
					pattern: "new\\s+SchemaFactory\\s*\\(",
				},
				{
					label: "Define Dice with value field",
					pattern: "sf\\.(object|objectRecursive)\\s*\\(\\s*[\"']Dice[\"']",
				},
			],
			solution: `${importsWithSchema}
${schemaBlock}

export default function App() {
  return (
    <div>
      <h2>Dice Roller</h2>
      <p>Schema defined! Move to the next step.</p>
    </div>
  );
}
`,
		},
		{
			id: "create-tree",
			title: "Step 2: Create an In-Memory SharedTree",
			description:
				"Now create an in-memory SharedTree using `createIndependentTreeBeta()`. This gives you a fully functional SharedTree without any server. First call `createIndependentTreeBeta()` to get a tree, then call `tree.viewWith()` with your schema config to get a view. Finally, initialize the view with a starting value \u2014 pass a plain object like `{ value: 1 }` and SharedTree automatically matches it to your schema.",
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsWithSchema}
${schemaBlock}

// TODO: Import createIndependentTreeBeta and TreeViewConfiguration
// from "fluid-framework" (add them to the existing import)

// TODO: Create a tree and then a view:
//   const tree = createIndependentTreeBeta();
//   const view = tree.viewWith(new TreeViewConfiguration({ schema: Dice }));

// TODO: Initialize the view with a plain object:
//   view.initialize({ value: 1 });

export default function App() {
  return (
    <div>
      <h2>Dice Roller</h2>
      <p>Create your SharedTree above!</p>
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				'Add to your import: `import { SchemaFactory, TreeViewConfiguration, createIndependentTreeBeta } from "fluid-framework";`',
				"Create tree: `const tree = createIndependentTreeBeta();`",
				"Create view: `const view = tree.viewWith(new TreeViewConfiguration({ schema: Dice }));`",
				"Initialize: `view.initialize({ value: 1 });`",
			],
			validationPatterns: [
				createTreeImportPattern,
				treeViewConfigPattern,
				createTreeCallPattern,
				viewWithPattern,
				initializePattern,
			],
			solution: `${importsWithTree}
${schemaBlock}
${treeSetupBlock}

export default function App() {
  return (
    <div>
      <h2>Dice Roller</h2>
      <p>Tree created and initialized! Move to the next step.</p>
    </div>
  );
}
`,
		},
		{
			id: "build-view",
			title: "Step 3: Build the Dice View",
			description:
				"Now render the dice value from your SharedTree. Read `view.root.value` and display it as a dice face emoji. The dice faces are: 1=\u2680, 2=\u2681, 3=\u2682, 4=\u2683, 5=\u2684, 6=\u2685.",
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsWithTree}
${schemaBlock}
${treeSetupBlock}
${diceFacesBlock}

// TODO: Create a DiceView component that:
// 1. Reads the current value from view.root.value
// 2. Displays the dice face emoji using the diceFaces array
// 3. Shows the numeric value

export default function App() {
  return (
    <div>
      <h2>Dice Roller</h2>
      {/* TODO: Render your DiceView component here */}
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				"Create a function component: `function DiceView() { ... }`",
				"Read the value: `const value = view.root.value;`",
				'Show the face: `<div className="dice-face">{diceFaces[value - 1]}</div>`',
				"Render it: `<DiceView />` inside the App return",
			],
			validationPatterns: [
				{
					label: "Read view.root.value",
					pattern: "view\\.root\\.value",
				},
				{
					label: "Render dice face",
					pattern: "diceFaces\\[",
				},
				{
					label: "DiceView component used in JSX",
					pattern: "<DiceView",
				},
			],
			solution: `${importsWithTree}
${schemaBlock}
${treeSetupBlock}
${diceFacesBlock}

function DiceView() {
  const value = view.root.value;
  return (
    <div className="dice-panel">
      <div className="dice-face">{diceFaces[value - 1]}</div>
      <p>Value: {value}</p>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <h2>Dice Roller</h2>
      <DiceView />
    </div>
  );
}
`,
		},
		{
			id: "add-roll",
			title: "Step 4: Add the Roll Button",
			description:
				"Add a button that rolls the dice. When clicked, it should set `view.root.value` to a random number between 1 and 6. This directly mutates the SharedTree node \u2014 exactly how you'd do it in a real Fluid app.",
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsWithTree}
${schemaBlock}
${treeSetupBlock}
${diceFacesBlock}

function DiceView() {
  const value = view.root.value;
  return (
    <div className="dice-panel">
      <div className="dice-face">{diceFaces[value - 1]}</div>
      <p>Value: {value}</p>
      {/* TODO: Add a roll button that sets view.root.value to a random 1-6 */}
    </div>
  );
}

export default function App() {
  return (
    <div>
      <h2>Dice Roller</h2>
      <DiceView />
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				"Add a `<button>` element with an `onClick` handler",
				"Generate random 1-6: `Math.floor(Math.random() * 6) + 1`",
				"Set the value: `view.root.value = Math.floor(Math.random() * 6) + 1;`",
				'Use `className="roll-button"` for styling',
			],
			validationPatterns: [
				{
					label: "Button element",
					pattern: "<button",
				},
				{
					label: "Click handler",
					pattern: "onClick",
				},
				{
					label: "Assign random value to view.root.value",
					pattern: "view\\.root\\.value\\s*=",
				},
			],
			solution: `${importsWithTree}
${schemaBlock}
${treeSetupBlock}
${diceFacesBlock}
${diceViewWithRoll}

export default function App() {
  return (
    <div>
      <h2>Dice Roller</h2>
      <DiceView />
    </div>
  );
}
`,
		},
		{
			id: "two-client-sync",
			title: "Step 5: Simulate Two-Client Sync",
			description:
				'Now for the magic of Fluid! Add `Tree.on(view.root, "nodeChanged", callback)` to listen for changes and use React state to trigger re-renders. Then render **two** DiceView panels side by side \u2014 both share the same SharedTree, so when either clicks "Roll", both update. This simulates the multi-client experience.',
			activeFile: "/App.tsx",
			files: {
				"/App.tsx": `${importsWithTreeAndEvents}
${schemaBlock}
${treeSetupBlock}
${diceFacesBlock}

function DiceView({ title }: { title: string }) {
  const [value, setValue] = React.useState(view.root.value);

  // TODO: Use React.useEffect to subscribe to tree changes:
  // Tree.on(view.root, "nodeChanged", () => setValue(view.root.value))
  // Don't forget to return the cleanup function!

  const roll = () => {
    view.root.value = Math.floor(Math.random() * 6) + 1;
  };

  return (
    <div className="dice-panel">
      <h2>{title}</h2>
      <div className="dice-face">{diceFaces[value - 1]}</div>
      <p>Value: {value}</p>
      <button className="roll-button" onClick={roll}>
        Roll
      </button>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <h3>Both panels share the same SharedTree!</h3>
      <div className="dice-container">
        {/* TODO: Render TWO DiceView components with different titles */}
        {/* e.g., "Client A" and "Client B" */}
      </div>
    </div>
  );
}
`,
				...scaffoldFiles,
			},
			hints: [
				'Use `React.useEffect(() => { ... }, [])` to set up the subscription once',
				'Subscribe: `const unsubscribe = Tree.on(view.root, "nodeChanged", () => setValue(view.root.value));`',
				"Return cleanup: `return unsubscribe;`",
				'Render two panels: `<DiceView title="Client A" />` and `<DiceView title="Client B" />`',
			],
			validationPatterns: [
				{
					label: 'Tree.on subscription with "nodeChanged"',
					pattern:
						'Tree\\.on\\s*\\(\\s*view\\.root\\s*,\\s*["\']nodeChanged["\']',
				},
				useEffectPattern,
				{
					label: "Two DiceView instances rendered",
					pattern: "<DiceView[^/]*/>.*<DiceView",
				},
			],
			solution: `${importsWithTreeAndEvents}
${schemaBlock}
${treeSetupBlock}
${diceFacesBlock}

function DiceView({ title }: { title: string }) {
  const [value, setValue] = React.useState(view.root.value);

  React.useEffect(() => {
    const unsubscribe = Tree.on(view.root, "nodeChanged", () => {
      setValue(view.root.value);
    });
    return unsubscribe;
  }, []);

  const roll = () => {
    view.root.value = Math.floor(Math.random() * 6) + 1;
  };

  return (
    <div className="dice-panel">
      <h2>{title}</h2>
      <div className="dice-face">{diceFaces[value - 1]}</div>
      <p>Value: {value}</p>
      <button className="roll-button" onClick={roll}>
        Roll
      </button>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <h3>Both panels share the same SharedTree!</h3>
      <div className="dice-container">
        <DiceView title="Client A" />
        <DiceView title="Client B" />
      </div>
    </div>
  );
}
`,
		},
	],
};
