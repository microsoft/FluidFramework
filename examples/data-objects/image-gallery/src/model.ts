/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";

const imageGalleryName = "@fluid-example/image-gallery";

export class ImageGalleryModel extends DataObject {
    public get imageList() {
        return [
            {
                original: "https://picsum.photos/800/800/?image=400",
                thumbnail: "https://picsum.photos/100/100/?image=400",
            },
            {
                original: "https://picsum.photos/800/800/?image=430",
                thumbnail: "https://picsum.photos/100/100/?image=430",
            },
            {
                original: "https://picsum.photos/800/800/?image=490",
                thumbnail: "https://picsum.photos/100/100/?image=490",
            },
            {
                original: "https://picsum.photos/800/800/?image=580",
                thumbnail: "https://picsum.photos/100/100/?image=580",
            },
            {
                original: "https://picsum.photos/800/800/?image=700",
                thumbnail: "https://picsum.photos/100/100/?image=700",
            },
        ];
    }

    public readonly setPosition = (index: number) => {
        if (typeof index !== "number") {
            throw new Error("Index is not a number");
        }
        this.root.set("position", index);
    };

    public readonly getPosition = () => {
        const position = this.root.get<number>("position");
        if (typeof position !== "number") {
            throw new Error("Position is not a number");
        }
        return position;
    };

    protected async initializingFirstTime() {
        this.root.set("position", 0);
    }

    protected async hasInitialized() {
        this.root.on("valueChanged", (changed, local) => {
            if (changed.key === "position") {
                this.emit("slideChanged", local);
            }
        });
    }
}

export const ImageGalleryInstantiationFactory = new DataObjectFactory<ImageGalleryModel, undefined, undefined, IEvent>
(
    imageGalleryName,
    ImageGalleryModel,
    [],
    {},
);
