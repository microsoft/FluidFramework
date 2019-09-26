/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import ImageGallery from "react-image-gallery";
import "../node_modules/react-image-gallery/styles/css/image-gallery.css";
import "./Styles.css";
import { ISharedMap } from "@microsoft/fluid-map";

export class ImageGalleryComponent extends PrimedComponent implements IComponentHTMLVisual {
  public get IComponentHTMLVisual() { return this; }
  
  imageList = [
    {
      original: "https://picsum.photos/800/800/?image=400",
      thumbnail: "https://picsum.photos/100/100/?image=400"
    },
    {
      original: "https://picsum.photos/800/800/?image=430",
      thumbnail: "https://picsum.photos/100/100/?image=430"
    },
    {
      original: "https://picsum.photos/800/800/?image=490",
      thumbnail: "https://picsum.photos/100/100/?image=490"
    },
    {
      original: "https://picsum.photos/800/800/?image=580",
      thumbnail: "https://picsum.photos/100/100/?image=580"
    },
    {
      original: "https://picsum.photos/800/800/?image=700",
      thumbnail: "https://picsum.photos/100/100/?image=700"
    }
  ];

  defaultProps = {
    items: [],
    showNav: true,
    autoPlay: false,
    lazyLoad: false
  };

  imageGallery: ImageGallery;
  images: ISharedMap;
  ignoreSlide: boolean = false;

  protected async componentInitializingFirstTime() {
    this.root.set("position", 0);
  }

  public render(div: HTMLDivElement) {
    div.className = "app-sandbox";

    const onSlide = (index) => {
      if (this.ignoreSlide) {
        this.ignoreSlide = false;
      } else {
        this.root.set("position", index);
      }
    }

    ReactDOM.render(
      <ImageGallery
        ref={gallery => (this.imageGallery = gallery)}
        items={this.imageList}
        onSlide={onSlide}
        slideDuration={10}
      />,
      div
    );

    this.imageGallery.slideToIndex(this.root.get("position"));

    this.root.on("valueChanged", (_, local) => {
      if (local) {
        return;
      }
      const position = this.root.get<number>("position");
      if (this.imageGallery) {
        this.imageGallery.slideToIndex(position);
        this.ignoreSlide = true;
      }
    });
  };
}

export const ImageGalleryInstantiationFactory = new PrimedComponentFactory(
  ImageGalleryComponent,
  [],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
  "@fluid-example/image-gallery",
  new Map([
    ["@fluid-example/image-gallery", Promise.resolve(ImageGalleryInstantiationFactory)],
  ]),
);
