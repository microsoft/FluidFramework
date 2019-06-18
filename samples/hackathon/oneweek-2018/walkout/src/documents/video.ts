/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { api as prague } from "@prague/routerlicious";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import { rev } from "../constants";

export class VideoDocument extends EventEmitter {
    public static async load(id: string, tenantId: string, secret: string): Promise<VideoDocument> {
        const revedId = `${id}${rev}`;
        const token = jwt.sign(
            {
                documentId: revedId,
                permission: "read:write",
                tenantId,
                user: {
                    id: "test",
                },
            },
            secret);

        // Load in the latest and connect to the document
        const collabDoc = await prague.api.load(revedId, { blockUpdateMarkers: true, token });

        await new Promise((resolve) => {
            collabDoc.once("connected", () => resolve());
        });

        const rootView = await collabDoc.getRoot().getView();

        // Add in the text string if it doesn't yet exist
        if (!collabDoc.existing) {
            rootView.set("videoId", "1VgVJpVx9bc");
            rootView.set("start", 0);
            rootView.set("end", 30);
        } else {
            await Promise.all([
                rootView.wait("videoId"),
            ]);
        }

        return new VideoDocument(rootView.getMap(), rootView);
    }

    public get id(): string {
        return this.view.get("videoId");
    }

    public set id(value: string) {
        this.view.set("videoId", value);
    }

    public get start(): number {
        return this.view.get("start");
    }

    public set start(value: number) {
        this.view.set("start", value);
    }

    public get end(): number {
        return this.view.get("end");
    }

    public set end(value: number) {
        this.view.set("end", value);
    }

    constructor(map: prague.types.IMap, private view: prague.types.IMapView) {
        super();

        map.on("valueChanged", (changed, local) => {
            if (changed.key === "videoId") {
                this.emit("videoChanged", local);
            } else if (changed.key === "start") {
                this.emit("startChanged", local);
            } else if (changed.key === "end") {
                this.emit("endChanged", local);
            }
        });
    }
}
