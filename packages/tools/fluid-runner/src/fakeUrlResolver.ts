/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import {
	IContainerPackageInfo,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";

const fakeId = "FakeUrlResolver";
const fakeUrl = "https://examplehost.com/FakeUrlResolver/";

/**
 * Fake URL resolver that returns hard coded values on every request
 * @internal
 */
export class FakeUrlResolver implements IUrlResolver {
	public async resolve(_request: IRequest): Promise<IResolvedUrl | undefined> {
		const fakeOdspResolvedUrl: IOdspResolvedUrl = {
			type: "fluid",
			odspResolvedUrl: true,
			id: fakeId,
			siteUrl: fakeUrl,
			driveId: fakeId,
			itemId: fakeId,
			url: fakeUrl,
			hashedDocumentId: fakeId,
			endpoints: {
				snapshotStorageUrl: fakeUrl,
				attachmentPOSTStorageUrl: fakeUrl,
				attachmentGETStorageUrl: fakeUrl,
				deltaStorageUrl: fakeUrl,
			},
			tokens: {},
			fileName: fakeId,
			summarizer: false,
			fileVersion: fakeId,
		};

		return fakeOdspResolvedUrl;
	}

	public async getAbsoluteUrl(
		_resolvedUrl: IResolvedUrl,
		_relativeUrl: string,
		_packageInfoSource?: IContainerPackageInfo,
	): Promise<string> {
		return "";
	}
}
