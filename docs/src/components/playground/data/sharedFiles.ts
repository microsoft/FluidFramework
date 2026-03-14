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
