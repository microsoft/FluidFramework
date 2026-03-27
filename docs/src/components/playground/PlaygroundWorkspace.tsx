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
 * Internal component that syncs external file changes into the live Sandpack
 * instance and reports code edits back to the parent via {@link onCodeChange}.
 *
 * By calling `sandpack.updateFile` imperatively we avoid destroying and
 * recreating the SandpackProvider (which would re-download and re-bundle every
 * npm dependency from scratch — the main cause of ~60 s load times).
 */
function SandpackBridge({
	files,
	activeFile,
	onCodeChange,
}: {
	files: SandpackFiles;
	activeFile: string;
	onCodeChange: (code: string) => void;
}): null {
	const { sandpack } = useSandpack();

	// Track previous files so we only call updateFile when they actually change.
	const prevFilesRef = React.useRef<SandpackFiles>(files);

	React.useEffect(() => {
		if (prevFilesRef.current === files) return;
		prevFilesRef.current = files;

		// Push every file into the running sandbox.
		for (const [path, content] of Object.entries(files)) {
			const code = typeof content === "string" ? content : content.code;
			sandpack.updateFile(path, code);
		}

		// Switch to the requested active file.
		sandpack.setActiveFile(activeFile);
	}, [files, activeFile, sandpack]);

	// Report edits back for validation.
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
 *
 * IMPORTANT: This component keeps a single SandpackProvider mounted for the
 * lifetime of the tutorial. Step changes push new files via the imperative
 * `updateFile` API so the bundler stays warm and dependencies are not
 * re-downloaded.
 */
export function PlaygroundWorkspace({
	files,
	activeFile,
	dependencies,
	onCodeChange,
}: PlaygroundWorkspaceProps): React.ReactElement {
	// Initial files are used only for the first mount of SandpackProvider.
	const initialFilesRef = React.useRef({ "/index.html": indexHtml, ...files });
	const customSetup = React.useMemo(() => ({ dependencies }), [dependencies]);

	const options = React.useMemo(
		() => ({
			activeFile,
			visibleFiles: [activeFile],
			recompileMode: "delayed" as const,
			recompileDelay: 500,
		}),
		[activeFile],
	);

	// Merge index.html into the file map so the bridge pushes it too.
	const allFiles = React.useMemo(
		() => ({ "/index.html": indexHtml, ...files }),
		[files],
	);

	return (
		<div className="ffcom-playground-workspace">
			<SandpackProvider
				template="vite-react-ts"
				files={initialFilesRef.current}
				customSetup={customSetup}
				options={options}
			>
				<SandpackLayout style={{ flexDirection: "column" }}>
					<SandpackCodeEditor
						showLineNumbers
						showTabs={false}
						style={{ minHeight: "400px", flex: "none" }}
					/>
					<SandpackPreview style={{ minHeight: "300px", flex: "none" }} />
				</SandpackLayout>
				<SandpackBridge
					files={allFiles}
					activeFile={activeFile}
					onCodeChange={onCodeChange}
				/>
			</SandpackProvider>
		</div>
	);
}
