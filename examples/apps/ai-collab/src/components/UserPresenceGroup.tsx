/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import { Avatar, Badge, styled } from "@mui/material";
import React, { useEffect, useState } from "react";

import type { PresenceManager } from "@/app/presence";

interface UserPresenceProps {
	presenceManager: PresenceManager;
}

const UserPresenceGroup: React.FC<UserPresenceProps> = ({ presenceManager }): JSX.Element => {
	const [invalidations, setInvalidations] = useState(0);

	useEffect(() => {
		// Listen to the attendeeJoined event and update the presence group when a new attendee joins
		const unsubJoin = presenceManager.getPresence().events.on("attendeeJoined", () => {
			setInvalidations(invalidations + Math.random());
		});
		// Listen to the attendeeDisconnected event and update the presence group when an attendee leaves
		const unsubDisconnect = presenceManager
			.getPresence()
			.events.on("attendeeDisconnected", () => {
				setInvalidations(invalidations + Math.random());
			});
		// Listen to the userInfoUpdate event and update the presence group when the user info is updated
		presenceManager.setUserInfoUpdateListener(() => {
			setInvalidations(invalidations + Math.random());
		});

		return () => {
			unsubJoin();
			unsubDisconnect();
			presenceManager.setUserInfoUpdateListener(() => {});
		};
	});

	// Get the list of connected attendees
	const connectedAttendees = [...presenceManager.getPresence().getAttendees()].filter(
		(attendee) => attendee.getConnectionStatus() === "Connected",
	);

	// Get the user info for the connected attendees
	const userInfoList = presenceManager.getUserInfo(connectedAttendees);

	const StyledBadge = styled(Badge)(({ theme }) => ({
		"& .MuiBadge-badge": {
			backgroundColor: "#44b700",
			color: "#44b700",
			boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
			"&::after": {
				position: "absolute",
				top: 0,
				left: 0,
				width: "100%",
				height: "100%",
				borderRadius: "50%",
				animation: "ripple 1.2s infinite ease-in-out",
				border: "1px solid currentColor",
				content: '""',
			},
		},
		"@keyframes ripple": {
			"0%": {
				transform: "scale(.8)",
				opacity: 1,
			},
			"100%": {
				transform: "scale(2.4)",
				opacity: 0,
			},
		},
	}));

	return (
		<div>
			{userInfoList.length === 0 ? (
				<Avatar alt="User Photo" sx={{ width: 56, height: 56 }} />
			) : (
				<>
					{userInfoList.slice(0, 4).map((userInfo, index) => (
						<StyledBadge
							key={index}
							overlap="circular"
							anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
							variant="dot"
						>
							<Avatar alt="User Photo" src={userInfo.photo} sx={{ width: 56, height: 56 }} />
						</StyledBadge>
					))}
					{userInfoList.length > 4 && (
						<Badge
							overlap="circular"
							anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
							badgeContent={`+${userInfoList.length - 4}`}
							color="primary"
						>
							<Avatar alt="More Users" sx={{ width: 56, height: 56 }} />
						</Badge>
					)}
				</>
			)}
		</div>
	);
};

export { UserPresenceGroup };
