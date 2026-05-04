/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type React from "react";

import type { TeamMember, WorkItem } from "../schema.js";

export interface TeamPanelProps {
	team: TeamMember[];
	workItems: WorkItem[];
}

export function TeamPanel({ team, workItems }: TeamPanelProps): React.ReactElement {
	return (
		<div className="team-panel">
			{team.map((member, index) => {
				const assignedPoints = workItems
					.filter((item) => item.assignee === member.name)
					.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);
				const ratio = member.capacity > 0 ? assignedPoints / member.capacity : 0;
				const pct = Math.min(ratio * 100, 100);
				const barClass = ratio > 1 ? "red" : ratio >= 0.8 ? "orange" : "green";

				return (
					<div className="team-card" key={index}>
						<div className="team-avatar">{member.name.charAt(0).toUpperCase()}</div>
						<div className="team-info">
							<div className="team-name">{member.name}</div>
							<div className="capacity-bar-bg">
								<div
									className={`capacity-bar-fill ${barClass}`}
									style={{ width: `${pct}%` }}
								/>
							</div>
							<div className="capacity-label">
								{assignedPoints} / {member.capacity} SP
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
