import { IRequest } from "@fluidframework/core-interfaces";
import { CreateNewHeader } from "@fluidframework/driver-definitions";

export function createCreateNewRequest(
    siteUrl: string,
    driveId: string,
    filePath: string,
    fileName: string
): IRequest {
    const createNewRequest: IRequest = {
        url: `${siteUrl}?driveId=${encodeURIComponent(
            driveId
        )}&path=${encodeURIComponent(filePath)}`,
        headers: {
            [CreateNewHeader.createNew]: {
                fileName,
            },
        },
    };
    return createNewRequest;
}
