/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import { Avatar, Badge, styled } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import type { UserPresence } from "@/app/presence";
import { getProfilePhoto } from "@/infra/authHelper";

interface UserPresenceProps {
	userPresenceGroup: UserPresence;
}

const UserPresenceGroup: React.FC<UserPresenceProps> = ({
	userPresenceGroup,
}): JSX.Element => {
	const photoUrlsMap = new Map<string, string>();
	const isFirstRender = useRef(true);
	const [photoUrls, setPhotoUrls] = useState<string[]>([]);
	const currentUserId: `id-${string}` = `id-${uuid()}`;

	/**
	 * fetch the user's photo if it's spe client, for the tinylicious client, it will use the default photo.
	 * */
	const updateUserPresenceGroup = async (): Promise<void> => {
		const clientId = process.env.NEXT_PUBLIC_SPE_CLIENT_ID;
		const tenantId = process.env.NEXT_PUBLIC_SPE_ENTRA_TENANT_ID;
		let photoUrl: string = "";

		// spe client
		if (tenantId !== undefined && clientId !== undefined) {
			photoUrl = await getProfilePhoto();
		}
		userPresenceGroup.props.onlineUsers.local.set(currentUserId, {
			value: { photo: photoUrl },
		});

		isFirstRender.current = false;
	};

	useEffect((): void => {
		if (isFirstRender.current) {
			updateUserPresenceGroup().catch((error) => console.error(error));
		}

		userPresenceGroup.props.onlineUsers.events.on("itemUpdated", (update) => {
			photoUrlsMap.set(update.key, update.value.value.photo);
			setPhotoUrls([...photoUrlsMap.values()]);
			console.log(photoUrls);
		});
		userPresenceGroup.props.onlineUsers.events.on("itemRemoved", (update) => {
			photoUrlsMap.delete(update.key);
			setPhotoUrls([...photoUrlsMap.values()]);
		});
	}, [
		photoUrls,
		photoUrlsMap,
		userPresenceGroup.props.onlineUsers.events,
		setPhotoUrls,
		updateUserPresenceGroup,
	]);

	// Detect when the page is closed
	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
			userPresenceGroup.props.onlineUsers.local.delete(currentUserId);
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		// Cleanup event listener on unmount
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	});

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
			{photoUrls.length === 0 ? (
				<Avatar alt="User Photo" sx={{ width: 56, height: 56 }} />
			) : (
				<>
					{photoUrls.slice(0, 4).map((photo, index) => (
						<StyledBadge
							key={index}
							overlap="circular"
							anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
							variant="dot"
						>
							<Avatar alt="User Photo" src={photo} sx={{ width: 56, height: 56 }} />
						</StyledBadge>
					))}
					{photoUrls.length > 4 && (
						<Badge
							overlap="circular"
							anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
							badgeContent={`+${photoUrls.length - 4}`}
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
