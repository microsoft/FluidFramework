/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";

const imageGalleryName = "@fluid-example/image-gallery";

const indexKey = "index";

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

    public readonly setIndex = (index: number) => {
        if (typeof index !== "number") {
            throw new Error("Index is not a number");
        }
        this.root.set(indexKey, index);
    };

    public readonly getIndex = () => {
        const index = this.root.get<number>(indexKey);
        if (typeof index !== "number") {
            throw new Error("Index is not a number");
        }
        return index;
    };

    protected async initializingFirstTime() {
        this.root.set(indexKey, 0);
    }

    protected async hasInitialized() {
        this.root.on("valueChanged", (changed, local) => {
            if (changed.key === indexKey) {
                this.emit("slideChanged");
            }
        });
    }
}

export const ImageGalleryInstantiationFactory = new DataObjectFactory(
    imageGalleryName,
    ImageGalleryModel,
    [],
    {},
);
