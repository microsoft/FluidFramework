/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type React from "react";
import { useState } from "react";

export interface ApiKeyInputProps {
	onSubmit: (apiKey: string) => void;
}

export function ApiKeyInput({ onSubmit }: ApiKeyInputProps): React.ReactElement {
	const [key, setKey] = useState("");

	const handleSubmit = (e: React.FormEvent): void => {
		e.preventDefault();
		if (key.trim()) {
			onSubmit(key.trim());
		}
	};

	return (
		<div className="api-key-screen">
			<form className="api-key-card" onSubmit={handleSubmit}>
				<h2>Sprint Planner</h2>
				<p>
					Enter your OpenAI API key to enable the AI assistant. Your key is only used in the
					browser and is never stored on a server.
				</p>
				<input
					type="password"
					className="api-key-input"
					placeholder="sk-..."
					value={key}
					onChange={(e) => setKey(e.target.value)}
					autoFocus
				/>
				<button type="submit" className="api-key-submit">
					Start Planning
				</button>
			</form>
		</div>
	);
}
