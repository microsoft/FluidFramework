/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

/**
 * Utility function to get the current Fluent UI theme to use.
 * @returns Theme object of FluentUI to be used for dev tool
 */
export function getEditFlagToUse(): { edit: boolean } {
	const defaultEditFlag = { edit: false };

	return defaultEditFlag;
}

// Create a type for the context value
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EditFlagContext = {
	editFlagInfo: { edit: boolean };
	setEditFlag: React.Dispatch<React.SetStateAction<{ edit: boolean }>>;
};

/**
 * Context for accessing a shared theme for communicating with the webpage.
 * @remarks setTheme is initially defined with a no-operation function as a placeholder
 * because we don't currently have a setter. The placeholder fills ThemeContext
 * until The React setter is truly defined in DevToolsView.
 */
export const EditFlagContext = React.createContext<EditFlagContext>({
	editFlagInfo: getEditFlagToUse(),
	setEditFlag: () => {},
});
