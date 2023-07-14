/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluentProvider } from "@fluentui/react-components";
import React from "react";

import { TelemetryNullLogger } from "@fluidframework/telemetry-utils";

import { MockMessageRelay } from "../MockMessageRelay";
import { MessageRelayContext } from "../../MessageRelayContext";
import { LoggerContext } from "../../TelemetryUtils";
import { getFluentUIThemeToUse } from "../../ThemeHelper";

/**
 * {@link ContextsDecorator} input props.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type ContextsDecoratorProps = React.PropsWithChildren<{}>;

/**
 * Wraps the input children in the contexts required by Devtools view components.
 *
 * 1. {@link MessageRelayContext}
 *
 * 2. {@link LoggerContext}
 *
 * 3. The required FluentUI theming context
 */
export function ContextsDecorator(props: ContextsDecoratorProps): React.ReactElement {
	const { children } = props;

	const themeInfo = getFluentUIThemeToUse();

	// TODO: extract relay and logger into constants
	return (
		<MessageRelayContext.Provider value={new MockMessageRelay(() => undefined)}>
			<LoggerContext.Provider value={new TelemetryNullLogger()}>
				<FluentProvider theme={themeInfo.theme}>{children}</FluentProvider>
			</LoggerContext.Provider>
		</MessageRelayContext.Provider>
	);
}
