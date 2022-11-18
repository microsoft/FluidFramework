/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { closeDebuggerPanel } from "./CloseDebuggerPanel";

/**
 * {@inheritDoc closeDebuggerPanel}
 */
closeDebuggerPanel().catch((error) => {
	console.error(error);
	throw error;
});
