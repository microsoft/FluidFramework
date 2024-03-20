/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { Button, Link, Tooltip, makeStyles } from "@fluentui/react-components";

// The `MessageBar` component was removed in FluentUI React v9 with no replacement offered.
// In the future, we will want to re-write this component to use something else, but for now this import is required.
// When these imports are removed, the `@fluentui/react` dependency should be removed from this package.
// eslint-disable-next-line no-restricted-imports
import { MessageBar, MessageBarType, initializeIcons } from "@fluentui/react";

// NoDevtoolsErrorBar uses legacy @fluentui/react, which requires explicit icon initialization.
initializeIcons();

const useStyles = makeStyles({
	root: {
		"& .ms-MessageBar-icon": {
			marginTop: "10px",
		},
	},
	retryButton: {
		marginLeft: "5px",
	},
	debugNote: {
		fontWeight: "normal",
		marginTop: "0px",
		marginBottom: "0px",
	},
});

/**
 * Core message displayed in the error notice bar.
 *
 * @remarks Note: this is only exported for testing purposes.
 */
export const coreErrorMessage =
	"It seems that Fluid Devtools has not been initialized in the current tab, or it did not respond in a timely manner.";

/**
 * URL pointing to help documentation for the Devtools.
 *
 * @remarks Note: this is only exported for testing purposes.
 */
export const docsLinkUrl = "https://aka.ms/fluid/devtool/docs";

/**
 * {@link NoDevtoolsErrorBar} input props.
 */
export interface NoDevtoolsErrorBarProps {
	/**
	 * Call to dismiss error notice bar.
	 */
	dismiss(): void;

	/**
	 * Reattempt to find devtools on the page.
	 */
	retrySearch(): void;
}

/**
 * TODO
 */
export function NoDevtoolsErrorBar(props: NoDevtoolsErrorBarProps): React.ReactElement {
	const { dismiss, retrySearch } = props;

	const styles = useStyles();

	return (
		<MessageBar
			messageBarType={MessageBarType.error}
			isMultiline={true}
			onDismiss={dismiss}
			dismissButtonAriaLabel="Close"
			className={styles.root}
		>
			{coreErrorMessage}
			<Tooltip
				content="Retry communicating with Fluid Devtools in the current tab."
				relationship="description"
			>
				<Button
					className={styles.retryButton}
					size="small"
					onClick={retrySearch}
					data-testid="retry-search-button"
				>
					Try again
				</Button>
			</Tooltip>
			<br />
			<h4 className={styles.debugNote}>
				Need help? Please refer to our
				<Link href={docsLinkUrl} target="_blank">
					documentation page
				</Link>{" "}
				for guidance on getting the extension working.{" "}
			</h4>
		</MessageBar>
	);
}
