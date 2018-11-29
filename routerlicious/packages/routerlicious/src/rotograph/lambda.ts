import { IDataBlob, MessageType } from "@prague/runtime-definitions";
import * as winston from "winston";
import * as core from "../core";
import { ITenantManager } from "../core";
import { IContext } from "../kafka-service/lambdas";
import { SequencedLambda } from "../kafka-service/sequencedLambda";
import * as utils from "../utils";
import { AzureMediaServicesManager, Permission } from "./amsUtils";

export class RotographLambda extends SequencedLambda {
    private taskQueueMap = new Map<string, string>();
    constructor(
        private permissions: any,
        protected context: IContext,
        private AMSHelper: AzureMediaServicesManager,
        private tenantManager: ITenantManager) {
        super(context);

        // tslint:disable-next-line:forin
        for (const queueName in this.permissions) {
            for (const task of this.permissions[queueName]) {
                this.taskQueueMap.set(task, queueName);
            }
        }
    }

    protected async handlerCore(message: utils.IMessage): Promise<void> {
        const boxcar = utils.extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === core.SequencedOperationType) {
                const sequencedMessage = baseMessage as core.ISequencedOperationMessage;

                if (sequencedMessage.operation.type === MessageType.BlobUploaded) {

                    const blobMessage = sequencedMessage.operation.contents as IDataBlob;
                    if (blobMessage.fileName.includes("upload")) {
                        const blobP = this.getBlob(sequencedMessage.tenantId, blobMessage.sha);
                        const uriP = this.blobHandler(blobMessage);

                        Promise.all([blobP, uriP])
                            .then(([blob, uri]) => {
                                this.AMSHelper.uploadContent(uri, blob);
                            });
                    }
                }
            }
        }

        this.context.checkpoint(message.offset);
    }

    private async getBlob(tenantId: string, sha: string): Promise<Buffer> {
        const tenant = await this.tenantManager.getTenant(tenantId);

        const blob = await tenant.gitManager.getBlob(sha);
        return new Buffer(blob.content, "base64");
    }

    private async blobHandler(message: IDataBlob): Promise<string> {
        const fileName = message.fileName;

        const accessPolicyId = await this.AMSHelper.createAssetPolicy(fileName, Permission.Write);

        const assetId = await this.AMSHelper.createAsset(fileName);

        const uploadUriP = this.AMSHelper.createSASLocator(accessPolicyId, assetId, fileName);
        return uploadUriP;
    }
}
