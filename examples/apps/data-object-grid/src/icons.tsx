/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CodeTextRegular,
	CursorClickRegular,
	DocumentTextRegular,
	DrawTextRegular,
	NumberSymbolRegular,
} from "@fluentui/react-icons";
import React from "react";

// Map icons names to their instantiated React element
export const iconMap = {
	Code: <CodeTextRegular />,
	Edit: <DocumentTextRegular />,
	FabricTextHighlight: <DrawTextRegular />,
	NumberSymbol: <NumberSymbolRegular />,
	Touch: <CursorClickRegular />,
} as const;
