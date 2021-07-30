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

export class ImageGalleryObject extends DataObject {
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
        console.log("setting", index);
        this.root.set("position", index);
    };

    public readonly getPosition = () => {
        return this.root.get<number>("position") ?? 0;
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

export const ImageGalleryInstantiationFactory = new DataObjectFactory<ImageGalleryObject, undefined, undefined, IEvent>
(
    imageGalleryName,
    ImageGalleryObject,
    [],
    {},
);
