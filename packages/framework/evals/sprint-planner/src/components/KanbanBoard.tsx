/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type React from "react";

import type { WorkItem } from "../schema.js";

import { WorkItemCard } from "./WorkItemCard.js";

const columns = [
	{ key: "todo", label: "Todo" },
	{ key: "in-progress", label: "In Progress" },
	{ key: "in-review", label: "In Review" },
	{ key: "done", label: "Done" },
] as const;

export interface KanbanBoardProps {
	workItems: WorkItem[];
}

export function KanbanBoard({ workItems }: KanbanBoardProps): React.ReactElement {
	return (
		<div className="kanban-board">
			{columns.map((col) => {
				const items = workItems.filter((item) => item.status === col.key);
				return (
					<div className="kanban-column" key={col.key}>
						<div className="column-header">
							{col.label}
							<span className="column-count">{items.length}</span>
						</div>
						<div className="column-cards">
							{items.map((item) => (
								<WorkItemCard key={item.id} item={item} />
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
