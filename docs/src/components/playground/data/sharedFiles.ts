/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared Sandpack entry file used by all tutorial modules.
 * Renders the App component into the root div.
 */
export const mainTsx = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
`;

// --- Shared import fragments for composing tutorial step files ---

/**
 * Bare React import.
 */
export const importsBase = `import React from "react";`;

/**
 * React + SchemaFactory import.
 */
export const importsWithSchema = `import React from "react";
import { SchemaFactory } from "fluid-framework";`;

/**
 * React + SchemaFactory + tree creation imports.
 */
export const importsWithTree = `import React from "react";
import { SchemaFactory, TreeViewConfiguration, createIndependentTreeBeta } from "fluid-framework";`;

/**
 * React + SchemaFactory + tree creation + Tree event imports.
 */
export const importsWithTreeAndEvents = `import React from "react";
import { SchemaFactory, TreeViewConfiguration, Tree, createIndependentTreeBeta } from "fluid-framework";`;

// --- Shared validation patterns used across tutorials ---

/**
 * Validation pattern that checks for a SchemaFactory import from fluid-framework.
 */
export const schemaFactoryImportPattern = {
	label: "Import SchemaFactory",
	pattern:
		"import\\s*\\{[^}]*SchemaFactory[^}]*\\}\\s*from\\s*[\"']fluid-framework[\"']",
};

/**
 * Validation pattern that checks for a createIndependentTreeBeta import.
 */
export const createTreeImportPattern = {
	label: "Import createIndependentTreeBeta",
	pattern:
		"import\\s*\\{[^}]*createIndependentTreeBeta[^}]*\\}\\s*from\\s*[\"']fluid-framework",
};

/**
 * Validation pattern that checks for TreeViewConfiguration usage.
 */
export const treeViewConfigPattern = {
	label: "Import TreeViewConfiguration",
	pattern: "TreeViewConfiguration",
};

/**
 * Validation pattern that checks for tree creation.
 */
export const createTreeCallPattern = {
	label: "Create tree",
	pattern: "createIndependentTreeBeta\\s*\\(",
};

/**
 * Validation pattern that checks for viewWith usage.
 */
export const viewWithPattern = {
	label: "Create view with viewWith",
	pattern: "\\.viewWith\\s*\\(",
};

/**
 * Validation pattern that checks for view initialization.
 */
export const initializePattern = {
	label: "Initialize the tree",
	pattern: "view\\.initialize\\s*\\(",
};

/**
 * Validation pattern that checks for useEffect usage.
 */
export const useEffectPattern = {
	label: "useEffect for subscription",
	pattern: "useEffect",
};
