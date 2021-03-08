/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";
import { getObjectWithIdFromContainer } from "@fluidframework/aqueduct";
import { IAudience } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IUser } from "@fluidframework/protocol-definitions";
import { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import { DOProviderContainerRuntimeFactory } from "./containerCode";

export class FluidDocument extends EventEmitter {
    audience: IAudience;
    constructor(private readonly container: Container, public readonly createNew: boolean) {
        super();
        this.audience = this.container.audience;
        // Consolidating the members changed around a single event which returns
        this.audience.on("addMember", () => {
            this.emit("membersChanged", this.getMembers());
        });

        this.audience.on("removeMember", () => {
            this.emit("membersChanged", this.getMembers());
        });
    }

    public async createDataObject<T = any>(type: string, id: string) {
        await this.container.request({ url: `/create/${type}/${id}` });
        const dataObject = await this.getDataObject<T>(id);
        return dataObject;
    }

    public async getDataObject<T = any>(id: string) {
        const dataObject = await getObjectWithIdFromContainer<T>(id, this.container);
        return dataObject;
    }

    public getMembers(): IUser[] {
        // Get all the current human members
        const fluidUsers = Array.from(this.audience.getMembers().values()).filter((member) => {
            // filter out non-human members
            // In fluid we use agents to save snapshots of the document back to the file
            return member.details.capabilities.interactive;
        });

        const users: IUser[] = [];
        fluidUsers.forEach((member: any) => {
            users.push({
                id: member.user.id ?? "",
            });
        });
        return users;
    }

    public getId() {
        return this.container.clientId;
    }

    public getMember(id: string) {
        return this.audience.getMember(id);
    }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Fluid {
    public static async createDocument(
        getContainerService: IGetContainerService,
        docId: string,
        registryEntries: NamedFluidDataStoreRegistryEntry[],
    ): Promise<FluidDocument> {
        const container = await getContainer(
            getContainerService,
            docId,
            new DOProviderContainerRuntimeFactory(registryEntries),
            true, /* createNew */
        );
        const document = new FluidDocument(container, true /* createNew */);
        return document;
    }

    public static async getDocument(
        getContainerService: IGetContainerService,
        docId: string,
        registryEntries: NamedFluidDataStoreRegistryEntry[],
    ): Promise<FluidDocument> {
        const container = await getContainer(
            getContainerService,
            docId,
            new DOProviderContainerRuntimeFactory(registryEntries),
            false, /* createNew */
        );
        const document = new FluidDocument(container, false /* createNew */);
        return document;
    }
}
