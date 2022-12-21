/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IStackProps, IStackStyles, PrimaryButton, Stack, TextField } from "@fluentui/react";
import React from "react";

import { SharedString } from "@fluidframework/sequence";

/**
 * {@link SharedStringView} input props.
 */
export interface SharedStringViewProps {
	/**
	 * {@link @fluidframework/sequence#SharedString} whose data will be displayed.
	 */
	sharedString: SharedString;
}

/**
 * Default {@link @fluidframework/sequence#SharedString} viewer.
 */
export function SharedStringView(props: SharedStringViewProps): React.ReactElement {
	const { sharedString } = props;

	const [text, setText] = React.useState<string>(sharedString.getText());

	const [deltaText, setDeltaText] = React.useState("");

	React.useEffect(() => {
		function updateText(): void {
			const newText = sharedString.getText();
			setDeltaText(newText);
			setText(newText);
		}

		sharedString.on("sequenceDelta", updateText);

		return (): void => {
			sharedString.off("sequenceDelta", updateText);
		};
	}, []);

	const stackStyles: Partial<IStackStyles> = { root: { width: 650 } };
	const stackTokens = { childrenGap: 50 };
	const columnProps: Partial<IStackProps> = {
		tokens: { childrenGap: 15 },
		styles: { root: { width: 300 } },
	};

	function updateText(): void {
		sharedString.replaceText(0, text.length, deltaText);
		sharedString.emit("sequenceDelta");
		setDeltaText("");
	}

	const updateDeltaText = (
		event: React.FormEvent<HTMLTextAreaElement | HTMLInputElement>,
		newValue?: string | undefined,
	): void => {
		setDeltaText(newValue ?? "");
	};

	return (
		<Stack horizontal tokens={stackTokens} styles={stackStyles}>
			<Stack {...columnProps}>
				<TextField
					id="sharedStringDebuggerEditorId"
					label="SharedString"
					multiline
					rows={3}
					defaultValue={text}
					onChange={updateDeltaText}
				/>
				<PrimaryButton disabled={deltaText === ""} onClick={updateText}>
					Submit Text
				</PrimaryButton>
			</Stack>
		</Stack>
	);
}
