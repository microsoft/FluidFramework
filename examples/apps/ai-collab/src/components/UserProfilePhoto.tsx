/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import { InteractiveBrowserCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
// eslint-disable-next-line import/no-internal-modules
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { Avatar, Badge, styled } from "@mui/material";
import React, { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";

import type { UserPresence } from "@/app/presence";

interface UserProfilePhotoProps {
	userPresenceGroup: UserPresence;
}

const UserProfilePhoto: React.FC<UserProfilePhotoProps> = ({
	userPresenceGroup,
}): JSX.Element => {
	const [photoUrls, setPhotoUrls] = useState<string[]>([]);
	const [isPhotoFetched, setIsPhotoFetched] = useState<boolean>(false);

	useEffect(() => {
		const allPhotos: string[] = [];
		for (const element of [...userPresenceGroup.onlineUsers.clientValues()]) {
			for (const user of [...element.items.values()]) {
				allPhotos.push(user.value.value.photo);
			}
		}
		setPhotoUrls(allPhotos);
	}, [userPresenceGroup]);

	useEffect(() => {
		const fetchPhoto = async (): Promise<void> => {
			const clientId = process.env.NEXT_PUBLIC_SPE_CLIENT_ID;
			const tenantId = process.env.NEXT_PUBLIC_SPE_ENTRA_TENANT_ID;
			if (tenantId === undefined || clientId === undefined) {
				return;
			}

			const credential = new InteractiveBrowserCredential({
				clientId,
				tenantId,
			});

			const authProvider = new TokenCredentialAuthenticationProvider(credential, {
				scopes: ["User.Read"],
			});

			const client = Client.initWithMiddleware({ authProvider });
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const photoBlob = await client.api("/me/photo/$value").get();
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				const photoUrl = URL.createObjectURL(photoBlob);
				setPhotoUrls((prevPhotos) => {
					if (!prevPhotos.includes(photoUrl)) {
						return [...prevPhotos, photoUrl];
					}
					return prevPhotos;
				});
				userPresenceGroup.onlineUsers.local.set(`id-${uuid()}`, {
					value: { photo: photoUrl },
				});
				setIsPhotoFetched(true);
			} catch (error) {
				console.error(error);
			}
		};

		if (!isPhotoFetched) {
			fetchPhoto().catch((error) => console.error(error));
		}
	}, [isPhotoFetched, setIsPhotoFetched]);

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
				photoUrls.map((photo, index) => (
					<StyledBadge
						key={index}
						max={4}
						overlap="circular"
						anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
						variant="dot"
					>
						<Avatar alt="User Photo" src={photo} sx={{ width: 56, height: 56 }} />
					</StyledBadge>
				))
			)}
		</div>
	);
};

export { UserProfilePhoto };
