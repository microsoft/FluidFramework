/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { independentView } from "@fluidframework/tree/alpha";

// Define a minimal schema to exercise SharedTree initialization.
const sf = new SchemaFactory("com.fluidframework.example.tree-startup-perf");

class Root extends sf.object("Root", {
	value: sf.number,
}) {}

const config = new TreeViewConfiguration({ schema: Root });
const view = independentView(config);
view.initialize({ value: 0 });

// Log to the console so the imports are not tree-shaken away.
console.log("SharedTree initialized", view.root.value);

// Paint a minimal element so Lighthouse can measure First Contentful Paint.
document.body.textContent = `SharedTree initialized: ${view.root.value}`;
