/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import * as fs from "fs";
import * as path from "path";
import { Mode, processContent } from "../../replayMultipleFiles";

function getFileLocation(documentName: string): string {
	return path.join(__dirname, `../../../content/snapshotTestContent/${documentName}`)
}

describe("Create attributionless snapshots", function() {
    this.timeout(300000);
	const testAttributionDocs = ['fhl-demos'];

	it(`Create attributionless snapshots for ${testAttributionDocs.join(',')}`, async () => {
		for (const docName of testAttributionDocs) {
			const docPath = getFileLocation(docName);
			const attributionlessName = `${docName}-attributionless`;
			const attributionlessPath = getFileLocation(attributionlessName);
			if (!fs.existsSync(docPath) || fs.existsSync(attributionlessPath)) {
				continue;
			}

			const docBaseSnapshotPath = path.join(docPath, "base_snapshot");
			const attributionBaseSnapshotPath = path.join(attributionlessPath, "base_snapshot");
			await fs.promises.mkdir(attributionBaseSnapshotPath, { recursive: true });
			for (const subNode of fs.readdirSync(docBaseSnapshotPath, { withFileTypes: true })) {
				assert(!subNode.isDirectory(), "base snapshots should be files");
				fs.copyFileSync(path.join(docBaseSnapshotPath, subNode.name), path.join(attributionBaseSnapshotPath, subNode.name));
			}
		
			const messages = require(path.join(docPath, "messages.json"));
			const attributionlessMessages = messages.map((message) => stripAttributionInfo(message));
			await fs.promises.writeFile(path.join(attributionlessPath, "messages.json"), JSON.stringify(attributionlessMessages, undefined, 2));
		}

        await processContent(Mode.NewSnapshots);
	});

});

function stripAttributionInfo(originalMessage: any) {
	const messageClone = JSON.parse(JSON.stringify(originalMessage));
	let mergeTreeOpContents = messageClone;
	while (mergeTreeOpContents && mergeTreeOpContents.seg === undefined) {
		mergeTreeOpContents = mergeTreeOpContents.contents ?? mergeTreeOpContents.content;
	}

	const props = mergeTreeOpContents?.seg?.props;
	if (props) {
		delete props.attribution;
		if (Object.keys(props).length === 0) {
			delete mergeTreeOpContents.seg.props;
		}
	}

	return messageClone;
}