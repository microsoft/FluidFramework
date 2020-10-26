/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IOdspAuthRequestInfo } from "./odspAuth";
export interface IOdspDriveItem {
    path: string;
    name: string;
    drive: string;
    item: string;
    isFolder: boolean;
}
export declare function getDriveItemByRootFileName(server: string, account: string, path: string, authRequestInfo: IOdspAuthRequestInfo, create: boolean, driveId?: string): Promise<IOdspDriveItem>;
export declare function getDriveItemByServerRelativePath(server: string, serverRelativePath: string, authRequestInfo: IOdspAuthRequestInfo, create: boolean): Promise<IOdspDriveItem>;
export declare function getDriveItemFromDriveAndItem(server: string, drive: string, item: string, authRequestInfo: IOdspAuthRequestInfo): Promise<IOdspDriveItem>;
export declare function getChildrenByDriveItem(driveItem: IOdspDriveItem, server: string, authRequestInfo: IOdspAuthRequestInfo): Promise<IOdspDriveItem[]>;
//# sourceMappingURL=odspDrives.d.ts.map