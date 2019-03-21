import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import ImageGallery from "react-image-gallery";
import "../node_modules/react-image-gallery/styles/css/image-gallery.css";
import "./Styles.css";
import ReactImageGallery from "react-image-gallery";

export class imagegallerycomponent extends Document {
  /**
   * Create the component's schema and perform other initialization tasks
   * (only called when document is initially created).
   */
  position: number;

  defaultProps = {
    items: [],
    showNav: true,
    autoPlay: false,
    lazyLoad: false
  };

  private images = [];

  imageGallery: ImageGallery;

  public async create() {
    this.root.set("position", 0);
    this.position = 1;
  }

  private GenerateImages()
  {
    var i:number; 
    var picNum : number = 400;
    for (i=0;i<5;i++)
    {
      picNum=picNum+i*30;
      this.images.push({original: 'https://picsum.photos/800/800/?image=' + picNum.toString(), thumbnail: 'https://picsum.photos/100/100/?image=' + picNum.toString()})
    }
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");

    if (maybeDiv) {
      
      this.GenerateImages();

      this.imageGallery = new ReactImageGallery(this.defaultProps);

      maybeDiv.className = "app-sandbox";
      
      // Don't try to render if there's not a root map yet
      this.runtime.on("connected", () => {
        this.render(maybeDiv);
      });

      this.root.on("op", () => {
        this.moveToNewSlidePosition();
        this.render(maybeDiv);
      });

      // Value changed is a subset of op
      // this.root.on("valueChanged");

    } else {
      return;
    }
  }

  /**
   * This function creates a slideChangedCallback, but it gives the callback a scope
   * that includes the appropriate this.root
   */
  private slideChangedCallbackFactory() {
    return (index) => {
      console.log(index);
      this.root.set("position", index);
    }
  }

  private async moveToNewSlidePosition(): Promise<number> {
    const position = await this.root.get<number>("position");
    this.imageGallery.slideToIndex(position);
    return position;
  }

  protected render(host: HTMLDivElement) {
    ReactDOM.render(
      <ImageGallery
        ref={i => (this.imageGallery = i)}
        items={this.images}
        onSlide={this.slideChangedCallbackFactory()}
      />,
      host
    );
  }
}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/counter", [
    ["@chaincode/counter", imagegallerycomponent]
  ]);
}