/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { openDebuggerPanel } from "./OpenDebuggerPanel";

/**
 * {@inheritDoc openDebuggerPanel}
 */
openDebuggerPanel().catch((error) => {
	console.error(error);
	throw error;
});
