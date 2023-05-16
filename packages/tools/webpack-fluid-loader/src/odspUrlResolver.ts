/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IUrlResolver, IResolvedUrl } from "@fluidframework/driver-definitions";
import {
	IOdspAuthRequestInfo,
	getDriveId,
	getDriveItemByRootFileName,
} from "@fluidframework/odsp-doclib-utils";
import {
	OdspDriverUrlResolver,
	createOdspUrl,
	createOdspCreateContainerRequest,
} from "@fluidframework/odsp-driver";

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
			undefined,
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
		// Using .fluid will make ODSP think that it's a Loop document
		const encoded = encodeURIComponent(`${documentId}.testFluid`);
		return `/r11s/${encoded}`;
	}

	public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
		return this.driverUrlResolver.getAbsoluteUrl(resolvedUrl, relativeUrl);
	}

	public async createCreateNewRequest(fileName: string): Promise<IRequest> {
		const filePath = "/r11s/";
		const driveId = await getDriveId(this.server, "", undefined, this.authRequestInfo);

		return createOdspCreateContainerRequest(
			`https://${this.server}`,
			driveId,
			filePath,
			`${fileName}.testFluid`,
		);
	}
}
