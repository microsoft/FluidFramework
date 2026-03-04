/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SandpackFiles } from "@codesandbox/sandpack-react";
import {
	SandpackCodeEditor,
	SandpackLayout,
	SandpackPreview,
	SandpackProvider,
	useSandpack,
} from "@codesandbox/sandpack-react";
import React from "react";

/**
 * Internal component that listens for code changes inside SandpackProvider.
 */
function CodeChangeListener({
	activeFile,
	onCodeChange,
}: {
	activeFile: string;
	onCodeChange: (code: string) => void;
}): null {
	const { sandpack } = useSandpack();

	React.useEffect(() => {
		const code = sandpack.files[activeFile]?.code ?? "";
		onCodeChange(code);
	}, [sandpack.files, activeFile, onCodeChange]);

	return null;
}

/**
 * {@link PlaygroundWorkspace} component props.
 */
export interface PlaygroundWorkspaceProps {
	/**
	 * Sandpack file map for the current step.
	 */
	files: SandpackFiles;

	/**
	 * Which file is active in the editor.
	 */
	activeFile: string;

	/**
	 * NPM dependencies for the Sandpack sandbox.
	 */
	dependencies: Record<string, string>;

	/**
	 * Callback when the user's code changes.
	 */
	onCodeChange: (code: string) => void;
}

/**
 * Vite entry HTML that references /main.tsx as the module entry point.
 * Provided to ensure the vite-react-ts template loads our custom entry file.
 */
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body>
<div id="root"></div>
<script type="module" src="/main.tsx"></script>
</body>
</html>`;

/**
 * Wraps Sandpack editor and preview in a side-by-side layout.
 *
 * Uses the vite-react-ts template so that code is transpiled by esbuild
 * instead of Babel. Babel's ES5 class transpilation adds _classCallCheck
 * which is incompatible with SharedTree's Reflect.construct-based proxy
 * node system, causing "Cannot call a class as a function" errors.
 */
export function PlaygroundWorkspace({
	files,
	activeFile,
	dependencies,
	onCodeChange,
}: PlaygroundWorkspaceProps): React.ReactElement {
	return (
		<div className="ffcom-playground-workspace">
			<SandpackProvider
				template="vite-react-ts"
				files={{
					"/index.html": indexHtml,
					...files,
				}}
				customSetup={{
					dependencies,
				}}
				options={{
					activeFile,
					visibleFiles: [activeFile],
					recompileMode: "delayed",
					recompileDelay: 500,
				}}
			>
				<SandpackLayout>
					<SandpackCodeEditor
						showLineNumbers
						showTabs={false}
						style={{ minHeight: "600px", flex: 1 }}
					/>
					<SandpackPreview style={{ minHeight: "600px", flex: 1 }} />
				</SandpackLayout>
				<CodeChangeListener activeFile={activeFile} onCodeChange={onCodeChange} />
			</SandpackProvider>
		</div>
	);
}
