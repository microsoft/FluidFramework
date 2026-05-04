/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useTree } from "@fluidframework/react/alpha";
import type { TreeViewAlpha } from "@fluidframework/tree/alpha";
import { SharedTreeSemanticAgent } from "@fluidframework/tree-agent/alpha";
import type React from "react";
import { useEffect, useState } from "react";

import { ChatPanel } from "./components/ChatPanel.js";
import { KanbanBoard } from "./components/KanbanBoard.js";
import { TeamPanel } from "./components/TeamPanel.js";
import { OpenAiChatModel } from "./openAiChatModel.js";
import type { SprintBoard } from "./schema.js";

import "./styles.css";

export interface SprintAppProps {
	treeView: TreeViewAlpha<typeof SprintBoard>;
	azureADTokenProvider: () => Promise<string>;
}

export function SprintApp({
	treeView,
	azureADTokenProvider,
}: SprintAppProps): React.ReactElement {
	const [agent, setAgent] = useState<
		SharedTreeSemanticAgent<typeof SprintBoard> | undefined
	>();

	useTree(treeView.root);

	useEffect(() => {
		const chatModel = new OpenAiChatModel({
			azureADTokenProvider,
			// In the browser, requests are proxied through the webpack dev server
			// which injects Entra ID auth server-side. Use the proxy path as the endpoint.
			endpoint: `${window.location.origin}/azure-openai`,
		});
		const newAgent = new SharedTreeSemanticAgent(chatModel, treeView, {
			domainHints:
				"This is a sprint planning board for an agile software development team. " +
				"Work items have statuses: todo, in-progress, in-review, done. " +
				"Priorities are: critical, high, medium, low. " +
				"Story points use Fibonacci numbers: 1, 2, 3, 5, 8, 13.",
		});
		setAgent(newAgent);
	}, [treeView, azureADTokenProvider]);

	if (agent === undefined) {
		return (
			<div className="api-key-screen">
				<p>Authenticating with Azure...</p>
			</div>
		);
	}

	const board = treeView.root;

	return (
		<div className="app-container">
			<header className="app-header">
				<div>
					<h1>{board.sprintName}</h1>
					<span className="subtitle">
						{board.workItems.length} items &middot; {board.team.length} members
					</span>
				</div>
			</header>
			<div className="app-body">
				<div className="main-content">
					<TeamPanel team={[...board.team]} workItems={[...board.workItems]} />
					<KanbanBoard workItems={[...board.workItems]} />
				</div>
				<ChatPanel agent={agent} />
			</div>
		</div>
	);
}
