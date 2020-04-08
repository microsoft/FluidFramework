/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import ImageGallery from "react-image-gallery";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "react-image-gallery/styles/css/image-gallery.css";
// eslint-disable-next-line import/no-unassigned-import
import "./Styles.css";
import { ISharedMap } from "@microsoft/fluid-map";

const imageGalleryName = "@fluid-example/image-gallery";

export class ImageGalleryComponent extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    imageList = [
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

    defaultProps = {
        items: [],
        showNav: true,
        autoPlay: false,
        lazyLoad: false,
    };

    imageGallery: ImageGallery | undefined;
    images: ISharedMap | undefined;

    private readonly onSlide = (index) => {
        this.root.set("position", index);
    };

    private readonly reactRender = (div, onSlide = this.onSlide) => {
        ReactDOM.render(
            <ImageGallery
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                ref={(gallery) => (this.imageGallery = gallery ?? undefined)}
                items={this.imageList}
                onSlide={onSlide}
                slideDuration={10}
            />,
            div,
        );
    };
    protected async componentInitializingFirstTime() {
        this.root.set("position", 0);
    }

    public render(div: HTMLDivElement) {
        div.className = "app-sandbox";

        this.reactRender(div);
        if (this.imageGallery !== undefined) {
            this.imageGallery.slideToIndex(this.root.get("position"));
        }

        this.root.on("valueChanged", (_, local) => {
            if (local) {
                return;
            }
            const position = this.root.get<number>("position");
            if (this.imageGallery !== undefined) {
                // This is a result of a remote slide, don't trigger onSlide for this slide
                this.reactRender(div, () => this.reactRender(div));
                this.imageGallery.slideToIndex(position);
            }
        });
    }
}

export const ImageGalleryInstantiationFactory = new PrimedComponentFactory(
    imageGalleryName,
    ImageGalleryComponent,
    [],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
    imageGalleryName,
    new Map([
        [imageGalleryName, Promise.resolve(ImageGalleryInstantiationFactory)],
    ]),
);
