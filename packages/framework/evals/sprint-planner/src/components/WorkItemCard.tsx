/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useTree } from "@fluidframework/react/alpha";
import type React from "react";

import type { WorkItem } from "../schema.js";

const statusOrder = ["todo", "in-progress", "in-review", "done"];

export interface WorkItemCardProps {
	item: WorkItem;
}

export function WorkItemCard({ item }: WorkItemCardProps): React.ReactElement {
	useTree(item);

	const currentIndex = statusOrder.indexOf(item.status);
	const canMoveLeft = currentIndex > 0;
	const canMoveRight = currentIndex < statusOrder.length - 1;

	const moveLeft = (): void => {
		if (canMoveLeft) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			item.status = statusOrder[currentIndex - 1]!;
		}
	};

	const moveRight = (): void => {
		if (canMoveRight) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			item.status = statusOrder[currentIndex + 1]!;
		}
	};

	return (
		<div className="work-item-card">
			<div className="card-top-row">
				<span className={`priority-badge ${item.priority}`}>{item.priority}</span>
				{item.storyPoints !== undefined && (
					<span className="story-points">{item.storyPoints} SP</span>
				)}
			</div>
			<div className="card-title">{item.title}</div>
			{item.description !== undefined && (
				<div className="card-description">{item.description}</div>
			)}
			<div className="card-footer">
				<div className="card-assignee">
					{item.assignee === undefined ? (
						<span className="assignee-name" style={{ fontStyle: "italic" }}>
							Unassigned
						</span>
					) : (
						<>
							<span className="assignee-avatar">{item.assignee.charAt(0).toUpperCase()}</span>
							<span className="assignee-name">{item.assignee}</span>
						</>
					)}
				</div>
				<div className="card-actions">
					{canMoveLeft && (
						<button className="move-btn" onClick={moveLeft} title="Move left">
							&#8592;
						</button>
					)}
					{canMoveRight && (
						<button className="move-btn" onClick={moveRight} title="Move right">
							&#8594;
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
