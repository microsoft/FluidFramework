import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import ImageGallery from "react-image-gallery";
import "../node_modules/react-image-gallery/styles/css/image-gallery.css";
import "./Styles.css";
import { ISharedMap } from "@prague/map";

export class ImageGalleryComponent extends Document {
  
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

  public async create() {
    this.root.set("position", 0);
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");

    if (maybeDiv) {
      maybeDiv.className = "app-sandbox";

      this.root.on("op", () => {
        const position = this.root.get<number>("position");
        if (this.imageGallery) {
          this.imageGallery.slideToIndex(position);
        }

        this.render(maybeDiv);
      });
    } else {
      return;
    }
  }


  protected render(host: HTMLDivElement) {

    const onSlide = (index) => {
      this.root.set("position", index);
    }

    ReactDOM.render(
      <ImageGallery
        ref={gallery => (this.imageGallery = gallery)}
        items={this.imageList}
        onSlide={onSlide}
        slideDuration={10}
      />,
      host
    );
  }
}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/counter", [
    ["@chaincode/counter", ImageGalleryComponent]
  ]);
}
