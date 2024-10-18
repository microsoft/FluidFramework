/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import { Avatar, Badge, styled } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

// eslint-disable-next-line import/no-internal-modules
import type { UserPresence } from "../app/presence";
// eslint-disable-next-line import/no-internal-modules
import { getProfilePhoto } from "../infra/authHelper";

interface UserPresenceProps {
	userPresenceGroup: UserPresence;
}

const UserPresenceGroup: React.FC<UserPresenceProps> = ({
	userPresenceGroup,
}): JSX.Element => {
	const isFirstRender = useRef(true);
	const [photoUrls, setPhotoUrls] = useState<string[]>([]);

	const fetchAllPhotos = (): string[] => {
		const allPhotos: string[] = [];
		// eslint-disable-next-line unicorn/no-array-for-each
		userPresenceGroup.props.onlineUsers.local.forEach((user) => {
			allPhotos.push(user.value.photo);
		});
		return allPhotos;
	};

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
		userPresenceGroup.props.onlineUsers.local.set(`id-${uuid()}`, {
			value: { photo: photoUrl },
		});

		isFirstRender.current = false;
	};

	useEffect((): void => {
		if (isFirstRender.current) {
			updateUserPresenceGroup().catch((error) => console.error(error));
		}

		const handleUpdate = (): void => {
			setPhotoUrls(fetchAllPhotos());
		};

		userPresenceGroup.props.onlineUsers.events.on("updated", handleUpdate);
	}, [
		userPresenceGroup.props.onlineUsers.events,
		photoUrls,
		fetchAllPhotos,
		setPhotoUrls,
		updateUserPresenceGroup,
	]);

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
