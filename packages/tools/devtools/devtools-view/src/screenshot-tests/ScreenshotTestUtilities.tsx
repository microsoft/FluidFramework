/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluentProvider } from "@fluentui/react-components";
import React from "react";

import { createChildLogger } from "@fluidframework/telemetry-utils";

import { MockMessageRelay } from "../test/MockMessageRelay";
import { MessageRelayContext } from "../MessageRelayContext";
import { LoggerContext } from "../TelemetryUtils";
import { getFluentUIThemeToUse } from "../ThemeHelper";

/**
 * {@link TestContexts} input props.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
type TestContextsProps = React.PropsWithChildren<{}>;

/**
 * Wraps the input children in the contexts required by Devtools view components.
 *
 * 1. {@link MessageRelayContext}
 *
 * 2. {@link LoggerContext}
 *
 * 3. The required FluentUI theming context
 */
function TestContexts(props: TestContextsProps): React.ReactElement {
	const { children } = props;

	const themeInfo = getFluentUIThemeToUse();

	// TODO: extract relay and logger into constants
	return (
		<MessageRelayContext.Provider value={new MockMessageRelay(() => undefined)}>
			<LoggerContext.Provider value={createChildLogger()}>
				<FluentProvider theme={themeInfo.theme}>{children}</FluentProvider>
			</LoggerContext.Provider>
		</MessageRelayContext.Provider>
	);
}

/**
 * Storybook context for wrapping components in {@link TestContexts}.
 */
export function testContextDecorator(story: () => React.ReactElement): React.ReactElement {
	return <TestContexts>{story()}</TestContexts>;
}
