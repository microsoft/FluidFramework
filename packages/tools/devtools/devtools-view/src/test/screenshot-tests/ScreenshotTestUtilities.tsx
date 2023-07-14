/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { FluentProvider } from "@fluentui/react-components";

import { TelemetryNullLogger } from "@fluidframework/telemetry-utils";

import { MockMessageRelay } from "../MockMessageRelay";
import { MessageRelayContext } from "../../MessageRelayContext";
import { LoggerContext } from "../../TelemetryUtils";
import { ThemeInfo, darkTheme, highContrastTheme, lightTheme } from "../../ThemeHelper";

/**
 * {@link ContextsDecorator} input props.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
type ContextsDecoratorProps = React.PropsWithChildren<{}>;

/**
 * Wraps the input children in the contexts required by Devtools view components.
 *
 * 1. {@link MessageRelayContext}
 *
 * 2. {@link LoggerContext}
 */
function ContextsDecorator(props: ContextsDecoratorProps): React.ReactElement {
	const { children } = props;

	// TODO: extract relay and logger into constants
	return (
		<MessageRelayContext.Provider value={new MockMessageRelay(() => undefined)}>
			<LoggerContext.Provider value={new TelemetryNullLogger()}>
				{children}
			</LoggerContext.Provider>
		</MessageRelayContext.Provider>
	);
}

const allThemes: ThemeInfo[] = [lightTheme, darkTheme, highContrastTheme];

/**
 * {@link ThemesDecorator} input props.
 */
export type ThemesDecoratorProps = React.PropsWithChildren<{
	/**
	 * The themes in which the child tree should be rendered.
	 *
	 * @defaultValue All supported themes.
	 */
	themes?: ThemeInfo[];
}>;

/**
 * Renders the provided children in each of the specified theme contexts, each in its own div.
 */
export function ThemesDecorator(props: ThemesDecoratorProps): React.ReactElement {
	const { children, themes = allThemes } = props;

	return (
		<ContextsDecorator>
			{themes.map(({ name: themeName, theme }) => (
				<FluentProvider key={themeName} theme={theme}>
					{children}
				</FluentProvider>
			))}
		</ContextsDecorator>
	);
}
