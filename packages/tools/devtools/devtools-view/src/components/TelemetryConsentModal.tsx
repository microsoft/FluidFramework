/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Button, Checkbox, makeStyles, shorthands, tokens } from "@fluentui/react-components";
import React from "react";

import { useTelemetryOptIn } from "../TelemetryUtils.js";

const useStyles = makeStyles({
	root: {
		position: "fixed",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		backgroundColor: "rgba(0, 0, 0, 0.2)",
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
	},
	modal: {
		backgroundColor: tokens.colorNeutralBackground1,
		color: tokens.colorNeutralForeground1,
		...shorthands.padding("20px"),
		...shorthands.borderRadius("8px"),
		boxShadow: "0 0 10px rgba(0, 0, 0, 0.3)",
	},
	optOut: {
		backgroundColor: tokens.colorNeutralBackground1Hover,
		...shorthands.padding("10px"),
		...shorthands.borderRadius("10px"),
	},
	close: {
		paddingTop: "10px",
		marginTop: "10px",
	},
});
/**
 * Props for the Modal component.
 */
interface ModalProps {
	/**
	 * Function to be called when the modal is closed.
	 */
	onClose: () => void;
}

/**
 * Modal component to display a message over the rest of the page.
 */
export function TelemetryConsentModal(props: ModalProps): React.ReactElement {
	const { onClose } = props;
	const styles = useStyles();
	const [optedIn, setOptedIn] = useTelemetryOptIn();

	return (
		<div className={styles.root}>
			<div className={styles.modal}>
				<h2>Welcome to the Fluid Framework Developer Tools!</h2>
				<p>
					To enhance your debugging experience, we collect anonymous usage data. <br />
					This helps us understand how you use our tools and improve their performance.
					<br />
					Rest assured, your privacy is our priority. <br />
					Thank you for helping us improve Fluid Framework Dev Tools!
				</p>
				<div className={styles.optOut}>
					<h2>Opt in to usage telemetry</h2>
					<p>
						We collect usage telemetry to improve the developer experience. <br /> You
						can opt out of this telemetry collection at any time in the Settings screen.
					</p>
					<Checkbox
						label={
							optedIn
								? "You've opted in to usage telemetry tracking."
								: "Click here to opt in to usage telemetry tracking."
						}
						checked={optedIn}
						onChange={(ev, data): void => {
							if (typeof data.checked === "boolean") {
								setOptedIn(data.checked);
							}
						}}
					/>
				</div>
				<div className={styles.close}>
					<Button onClick={onClose}>Close</Button>
				</div>
			</div>
		</div>
	);
}
