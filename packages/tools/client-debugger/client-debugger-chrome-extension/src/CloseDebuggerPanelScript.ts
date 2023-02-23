/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { closeDebuggerPanel } from "./CloseDebuggerPanel";

/**
 * Invokes {@link closeDebuggerPanel}.
 *
 * @remarks This module assumes it is being run directly in the page context as an "Injected Script".
 * It requires access to the same global context as the page contents so it can access the debugger registry.
 */
closeDebuggerPanel().catch((error) => {
	console.error(error);
	throw error;
});
