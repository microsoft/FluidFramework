/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { Button, Link, makeStyles, Tooltip } from "@fluentui/react-components";
import { initializeIcons, MessageBar, MessageBarType } from "@fluentui/react";

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
 * {@link NoDevtoolsErrorBar} input props.
 */
export interface NoDevtoolsErrorBarProps {
	/**
	 * Call to dismiss error notice bar.
	 */
	onDismiss(): void;

	/**
	 * Reattempt to find devtools on the page.
	 */
	retrySearch(): void;
}

/**
 * TODO
 */
export function NoDevtoolsErrorBar(props: NoDevtoolsErrorBarProps): React.ReactElement {
	const { onDismiss, retrySearch } = props;

	const styles = useStyles();

	return (
		<MessageBar
			messageBarType={MessageBarType.error}
			isMultiline={true}
			onDismiss={onDismiss}
			dismissButtonAriaLabel="Close"
			className={styles.root}
		>
			It seems that Fluid Devtools has not been initialized in the current tab, or it did not
			respond in a timely manner.
			<Tooltip
				content="Retry communicating with Fluid Devtools in the current tab."
				relationship="description"
			>
				<Button className={styles.retryButton} size="small" onClick={retrySearch}>
					Try again
				</Button>
			</Tooltip>
			<br />
			<h4 className={styles.debugNote}>
				Need help? Please refer to our
				<Link href="https://aka.ms/fluid/devtool/docs" target="_blank">
					documentation page
				</Link>{" "}
				for guidance on getting the extension working.{" "}
			</h4>
		</MessageBar>
	);
}
