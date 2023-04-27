/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TooltipHost } from "@fluentui/react";
import { Button, useId } from "@fluentui/react-components";
import React from "react";

import { SharedCell } from "@fluidframework/cell";

/**
 * {@link EmojiButton} input props.
 */
export interface EmojiButtonProps {
	emojiCell: SharedCell<boolean>;
}

/**
 * Simple button that displays either a smily or frouny emoji.
 * Pressing the button toggles between the two.
 *
 * State is shared via the provided `SharedCell`.
 */
export function EmojiButton(props: EmojiButtonProps): React.ReactElement {
	const { emojiCell } = props;

	// undefined => No expression
	// false => frouny
	// true => smily
	const [isSmily, setIsSmily] = React.useState<boolean | undefined>(emojiCell.get());

	React.useEffect(() => {
		function updateState(): void {
			setIsSmily(emojiCell.get());
		}

		emojiCell.on("valueChanged", updateState);
		emojiCell.on("delete", updateState);

		return (): void => {
			emojiCell.off("valueChanged", updateState);
			emojiCell.on("delete", updateState);
		};
	}, [emojiCell, isSmily, setIsSmily]);

	const buttonTooltipId = useId("decrement-counter-button");

	const emoji = isSmily === undefined ? "😐" : isSmily ? "🙂" : "☹️";

	function onClick(): void {
		emojiCell.set(isSmily === undefined ? true : !isSmily);
	}

	return (
		<TooltipHost content="Toggle Emoji" id={buttonTooltipId}>
			<Button
				onClick={onClick}
				aria-describedby={buttonTooltipId}
				size="large"
				shape="square"
				icon={emoji}
			/>
		</TooltipHost>
	);
}
