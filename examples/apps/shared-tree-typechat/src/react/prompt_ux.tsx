/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dialog } from "@headlessui/react";
import React, { useState } from "react";

export default function Prompt(props: {
	isOpen: boolean;
	setIsOpen: (arg: boolean) => void;
	insertTemplate: (prompt: string) => Promise<void>;
}): JSX.Element {
	const [templatePrompt, setTemplatePrompt] = useState("");
	const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
	const buttonClass = "bg-gray-500 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded";
	return (
		<Dialog
			className="absolute rounded bg-blue-300 p-4 w-[500px] h-fit m-auto left-0 right-0 top-0 bottom-0 z-50 drop-shadow-xl"
			open={props.isOpen}
			onClose={() => props.setIsOpen(false)}
		>
			<Dialog.Panel className="w-full text-left align-middle">
				<Dialog.Title className="font-bold text-lg">Get things started...</Dialog.Title>
				<Dialog.Description>
					{isLoadingTemplate
						? "Generating template..."
						: "Generate session ideas based on this prompt."}
				</Dialog.Description>
				<div className={isLoadingTemplate ? "invisible" : ""}>
					<textarea
						rows={4}
						className="resize-none border-2 border-gray-500 bg-white p-2 my-2 text-black w-full h-full"
						value={templatePrompt}
						id="insertTemplateInput"
						aria-label="Describe the template to be inserted"
						onChange={(e) => {
							setTemplatePrompt(e.target.value);
						}}
					/>
					<div className="flex flex-row gap-4">
						<button
							className={buttonClass}
							id="insertTemplateButton"
							onClick={() => {
								setIsLoadingTemplate(true);
								props.insertTemplate(templatePrompt).then(() => {
									setIsLoadingTemplate(false);
									props.setIsOpen(false);
								});
							}}
						>
							Get me started
						</button>
						<button className={buttonClass} onClick={() => props.setIsOpen(false)}>
							Cancel
						</button>
					</div>
				</div>
			</Dialog.Panel>
		</Dialog>
	);
}
