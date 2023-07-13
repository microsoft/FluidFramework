/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import React from "react";
import { FluentProvider } from "@fluentui/react-components";

import { TelemetryNullLogger } from "@fluidframework/telemetry-utils";

import { MockMessageRelay } from "../MockMessageRelay";
import { MessageRelayContext } from "../../MessageRelayContext";
import { LoggerContext } from "../../TelemetryUtils";
import { getFluentUIThemeToUse } from "../../ThemeHelper";

/**
 * {@link TestContext} input props.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type TestContextProps = React.PropsWithChildren<{}>;

/**
 * TODO
 */
export function TestContext(props: TestContextProps): React.ReactElement {
	const { children } = props;

	// TODO: extract relay and logger into constants
	return (
		<MessageRelayContext.Provider value={new MockMessageRelay(() => undefined)}>
			<LoggerContext.Provider value={new TelemetryNullLogger()}>
				<FluentProvider theme={getFluentUIThemeToUse().theme}>{children}</FluentProvider>
			</LoggerContext.Provider>
		</MessageRelayContext.Provider>
	);
}
