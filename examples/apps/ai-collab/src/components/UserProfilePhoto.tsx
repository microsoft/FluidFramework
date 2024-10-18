/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { InteractiveBrowserCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { Avatar, Badge } from "@mui/material";
import React, { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";

import type { UserPresence } from "@/app/tasks-list/presence";

interface UserProfilePhotoProps {
	onlineUsers: UserPresence;
}

const UserProfilePhoto: React.FC<UserProfilePhotoProps> = ({ onlineUsers }) => {
	const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
	if (AZURE_CLIENT_ID === undefined) {
		throw new Error("AZURE_CLIENT_ID environment variable is not set");
	}

	const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
	if (AZURE_TENANT_ID === undefined) {
		throw new Error("AZURE_TENANT_ID environment variable is not set");
	}

	const [photos, setPhotos] = useState<string[]>([]);
	useEffect(() => {
        const allPhotos: string[] = [];
        for (const element of Array.from(onlineUsers.onlineUsers.clientValues())) {
            for (const user of Array.from(element.items.values())) {
                allPhotos.push(user.value.value.photo);
            }
        }
        setPhotos(allPhotos);
    }, [onlineUsers]);

	useEffect(() => {
		const fetchPhoto = async () => {
			const credential = new InteractiveBrowserCredential({
				clientId: AZURE_CLIENT_ID,
				tenantId: AZURE_TENANT_ID,
			});

			const authProvider = new TokenCredentialAuthenticationProvider(credential, {
				scopes: ["User.Read"],
			});

			const client = Client.initWithMiddleware({ authProvider });

			try {
				const photoBlob = await client.api("/me/photo/$value").get();
				const photoUrl = URL.createObjectURL(photoBlob);
				const newAllPhotos: string[] = [...photos];
				newAllPhotos.push(photoUrl);
				setPhotos(newAllPhotos);
				onlineUsers.onlineUsers.local.set(`id-${uuid()}`, { value: { photo: photoUrl } });
			} catch (error) {
				console.error(error);
			}
		};

		// TODO: fetch user avatar when it's a new user
		if (photos.length == 0) {
			fetchPhoto();
		}
	}, [photos]);

	return (
		<div>
			{photos.map((photo, index) => (
				<Badge
					key={index}
					overlap="circular"
					anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
					variant="dot"
				>
					<Avatar alt="User Photo" src={photo} sx={{ width: 56, height: 56 }} />
				</Badge>
			))}
		</div>
	);
};

export default UserProfilePhoto;
