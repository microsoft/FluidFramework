/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ImplicitFieldSchema } from "@fluidframework/tree";
import type { SharedTreeSemanticAgent } from "@fluidframework/tree-agent/alpha";
import type React from "react";
import { useEffect, useRef, useState } from "react";

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export interface ChatPanelProps {
	agent: SharedTreeSemanticAgent<ImplicitFieldSchema>;
}

export function ChatPanel({ agent }: ChatPanelProps): React.ReactElement {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, loading]);

	const handleSend = async (): Promise<void> => {
		const text = input.trim();
		if (!text || loading) return;

		setInput("");
		setMessages((prev) => [...prev, { role: "user", content: text }]);
		setLoading(true);

		try {
			const response = await agent.query(text);
			setMessages((prev) => [...prev, { role: "assistant", content: response }]);
		} catch (error) {
			setMessages((prev) => [
				...prev,
				{
					role: "assistant",
					content: `Error: ${error instanceof Error ? error.message : String(error)}`,
				},
			]);
		} finally {
			setLoading(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent): void => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSend();
		}
	};

	return (
		<div className="chat-panel">
			<div className="chat-header">AI Assistant</div>
			<div className="chat-messages">
				{messages.length === 0 && (
					<div
						style={{
							color: "#86868b",
							fontSize: "13px",
							textAlign: "center",
							marginTop: "24px",
						}}
					>
						Ask me to create tasks, move items, assign work, or analyze the sprint.
					</div>
				)}
				{messages.map((msg, i) => (
					<div key={i} className={`chat-bubble ${msg.role}`}>
						{msg.content}
					</div>
				))}
				{loading && <div className="chat-thinking">Thinking...</div>}
				<div ref={messagesEndRef} />
			</div>
			<div className="chat-input-area">
				<input
					className="chat-input"
					placeholder="Ask the AI assistant..."
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					disabled={loading}
				/>
				<button
					className="chat-send-btn"
					onClick={() => {
						void handleSend();
					}}
					disabled={loading || !input.trim()}
				>
					&#8593;
				</button>
			</div>
		</div>
	);
}
