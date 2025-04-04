/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions/internal";
import {
	IOdspAuthRequestInfo,
	getDriveItemByRootFileName,
} from "@fluidframework/odsp-doclib-utils/internal";
import {
	OdspDriverUrlResolver,
	// eslint-disable-next-line import/no-deprecated
	createOdspCreateContainerRequest,
	createOdspUrl,
} from "@fluidframework/odsp-driver/internal";

export class OdspUrlResolver implements IUrlResolver {
	private readonly driverUrlResolver = new OdspDriverUrlResolver();

	constructor(
		private readonly server: string,
		private readonly authRequestInfo: IOdspAuthRequestInfo,
	) {}

	public async resolve(request: IRequest): Promise<IResolvedUrl> {
		try {
			const resolvedUrl = await this.driverUrlResolver.resolve(request);
			return resolvedUrl;
		} catch (error) {}

		const url = new URL(request.url);

		const fullPath = url.pathname.substr(1);
		const documentId = fullPath.split("/")[0];
		const dataStorePath = fullPath.slice(documentId.length + 1);
		const filePath = this.formFilePath(documentId);

		const { driveId, itemId } = await getDriveItemByRootFileName(
			this.server,
			"",
			filePath,
			this.authRequestInfo,
			true,
		);

		const odspUrl = createOdspUrl({
			siteUrl: `https://${this.server}`,
			driveId,
			itemId,
			dataStorePath,
		});

		return this.driverUrlResolver.resolve({ url: odspUrl, headers: request.headers });
	}

	private formFilePath(documentId: string): string {
		const encoded = encodeURIComponent(`${documentId}.fluid`);
		return `/r11s/${encoded}`;
	}

	public async getAbsoluteUrl(
		resolvedUrl: IResolvedUrl,
		relativeUrl: string,
	): Promise<string> {
		return this.driverUrlResolver.getAbsoluteUrl(resolvedUrl, relativeUrl);
	}

	public async createCreateNewRequest(fileName: string): Promise<IRequest> {
		const filePath = "/r11s/";
		const { driveId } = await getDriveItemByRootFileName(
			this.server,
			"",
			"/",
			this.authRequestInfo,
			false,
		);
		// eslint-disable-next-line import/no-deprecated
		return createOdspCreateContainerRequest(
			`https://${this.server}`,
			driveId,
			filePath,
			`${fileName}.fluid`,
		);
	}
}
