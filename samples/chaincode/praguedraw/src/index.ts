/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import ReinventedColorWheel from "reinvented-color-wheel";

import "reinvented-color-wheel/css/reinvented-color-wheel.min.css";
import "./style.css";

export class PragueDraw extends Document {

  private readonly canvasId = "drawingSurface";
  private readonly borderHeightId = "borderHeight";
  private readonly borderWidthId = "borderWidth"

  private drawSharedMap: ISharedMap;
  private propertiesSharedMap: ISharedMap;

  private lastSeen = 0;
  private isPainting: boolean;
  private mouseLeave: boolean;

  private penSize = "5";
  private drawColor = "#000000";

  protected async create() {
    const clickMap = this.createMap("click");
    const propertiesMap = this.createMap("properties");

    await propertiesMap.set("width", 1000);
    await propertiesMap.set("height", 1000);

    this.root.set("click", clickMap);
    this.root.set("properties", propertiesMap);
  }
  
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      this.drawSharedMap = await this.root.wait<ISharedMap>("click");
      this.render(maybeDiv);
    } else {
      return;
    }
  }

  private async render(host: HTMLDivElement) {

    // store local references to the collaborative objects.
    [this.drawSharedMap, this.propertiesSharedMap] = await Promise.all([this.root.wait<ISharedMap>("click"), this.root.wait<ISharedMap>("properties")])

    // Set the expected behavior for when we get a new value draw value
    this.drawSharedMap.on("valueChanged", () => {
      this.draw();
    });

    // Set the expected behavior for when we get a properties change
    this.propertiesSharedMap.on("valueChanged", () => {
      this.redraw();
    })

    // Create the color wheel
    const colorWheelElement = this.createColorWheelElement();

    // Create the drawing canvas
    const drawingCanvas = await this.createDrawingCanvasElement();

    // Create the border size element
    const borderSizeElement = await this.createBorderSizeElement();
    
    // Create the pen size element
    const penSizeElement = this.createPenSizeElement();

    host.appendChild(colorWheelElement);
    host.appendChild(borderSizeElement);
    host.appendChild(penSizeElement);
    host.appendChild(drawingCanvas);
  }

  private async createBorderSizeElement(): Promise<HTMLDivElement> {
    const [width,height] = await Promise.all([this.propertiesSharedMap.wait<number>("width"), this.propertiesSharedMap.wait<number>("height")]);

    const borderWidthElement = document.createElement("input");
    borderWidthElement.type = "number";
    borderWidthElement.step = "100";
    borderWidthElement.id = this.borderWidthId;
    borderWidthElement.style.display = "inline";
    borderWidthElement.value = width.toString();
    borderWidthElement.onchange = async () => {
      this.propertiesSharedMap.set("width", parseInt(borderWidthElement.value));
    }

    const borderHeightElement = document.createElement("input");
    borderHeightElement.type = "number";
    borderHeightElement.step = "100";
    borderHeightElement.id = this.borderHeightId;
    borderHeightElement.style.display = "inline";
    borderHeightElement.value = height.toString();
    borderHeightElement.onchange = async () => {
      this.propertiesSharedMap.set("height", parseInt(borderHeightElement.value));
    }

    const widthWrappingDiv = document.createElement("div");
    widthWrappingDiv.textContent = 'WIDTH:';

    const heightWrappingDiv = document.createElement("div");
    heightWrappingDiv.textContent = 'HEIGHT:';

    const borderWrappingDiv = document.createElement("div");
    widthWrappingDiv.appendChild(borderWidthElement);
    heightWrappingDiv.appendChild(borderHeightElement);
    borderWrappingDiv.appendChild(widthWrappingDiv);
    borderWrappingDiv.appendChild(heightWrappingDiv);

    return borderWrappingDiv;
  }

  private createPenSizeElement(): HTMLDivElement {
    const penSizeElement = document.createElement("input");
    penSizeElement.type = "range";
    penSizeElement.min = "1";
    penSizeElement.max = "50";
    penSizeElement.step = "1";
    penSizeElement.className = "slider";
    penSizeElement.value = this.penSize;
    penSizeElement.oninput = () => {
      this.penSize = penSizeElement.value;
    }

    const penWrappingDiv = document.createElement("div");
    penWrappingDiv.textContent = 'SIZE:';
    penWrappingDiv.appendChild(penSizeElement);

    return penWrappingDiv;
  }

  private createColorWheelElement(): HTMLDivElement {
    const colorWheelDiv = document.createElement("div");
    colorWheelDiv.id = "color-picker-container";

    const colorWheel = new ReinventedColorWheel({
      // what to append to
      appendTo: colorWheelDiv,
     
      // initial color
      hex: this.drawColor,
     
      // appearance
      wheelDiameter: 100,
      wheelThickness: 10,
      handleDiameter: 5,
      wheelReflectsSaturation: true,
    });

    colorWheel.onChange = (c) => { this.drawColor = c.hex; };

    return colorWheelDiv;
  }

  private async createDrawingCanvasElement(): Promise<HTMLCanvasElement>{
    const [width,height] = await Promise.all([this.propertiesSharedMap.wait<number>("width"), this.propertiesSharedMap.wait<number>("height")]);
    
    const canvasNode = document.createElement("canvas");
    canvasNode.id = this.canvasId;
    canvasNode.width = width;
    canvasNode.height = height;
    canvasNode.style.border = "1px solid black";
    canvasNode.style.display = "block";

    canvasNode.onmousedown = (e) => {
      const mouseX = e.pageX - canvasNode.offsetLeft;
      const mouseY = e.pageY - canvasNode.offsetTop;
        
      this.isPainting = true;
      this.mouseLeave = false;
      this.addClick(mouseX, mouseY, false);
    };

    canvasNode.onmousemove = (e) => {
      if(this.isPainting){
        const mouseX = e.pageX - canvasNode.offsetLeft;
        const mouseY = e.pageY - canvasNode.offsetTop;
        this.addClick(mouseX, mouseY, !this.mouseLeave);

        this.mouseLeave = false;
      }
    }

    canvasNode.addEventListener("touchstart", (e) => {
      const touches = e.changedTouches;

      for(let i =0; i < touches.length; i++) {
        const mouseX = touches[i].pageX - canvasNode.offsetLeft;
        const mouseY = touches[i].pageY - canvasNode.offsetTop;
        this.isPainting = true;
        this.addClick(mouseX, mouseY, false);
      }
    });

    canvasNode.addEventListener("touchmove", (e) => {
      if(this.isPainting){
        const touches = e.changedTouches;
        for(let i =0; i < touches.length; i++) {
          const mouseX = touches[i].pageX - canvasNode.offsetLeft;
          const mouseY = touches[i].pageY - canvasNode.offsetTop;
          this.addClick(mouseX, mouseY, true);
        }
      }
    });

    // Mouse leave canvas
    canvasNode.onmouseleave = () => {
      this.mouseLeave = true;
    }

    // Mouse release
    canvasNode.onmouseup = () => {
      this.isPainting = false;
    }

    // Exit touch
    canvasNode.addEventListener("touchend", () => {
      this.isPainting = false;
    });

    return canvasNode;
  }

  private async addClick(x: number, y: number, drag: boolean) {
      const size = await this.drawSharedMap.size;
      this.drawSharedMap.set(size.toString(), new DrawItem(x, y, drag, this.drawColor, parseInt(this.penSize)));
  }

  private async redraw(){
    const [width, height] = await Promise.all([this.propertiesSharedMap.get<number>("width"), this.propertiesSharedMap.get<number>("height")]);
    
    // Update the canvasNode with new width/height
    let canvasNode = document.getElementById(this.canvasId) as HTMLCanvasElement;
    canvasNode.width = width;
    canvasNode.height = height;

    // Update the width/height elements with new width/height
    let heightElement = document.getElementById(this.borderHeightId) as HTMLInputElement;
    heightElement.value = height.toString();

    let widthElement = document.getElementById(this.borderWidthId) as HTMLInputElement;
    widthElement.value = width.toString();

    this.lastSeen = 0;
    this.draw();
  }

  private async draw() {
    let canvasNode = document.getElementById(this.canvasId) as HTMLCanvasElement;
    const context = canvasNode.getContext('2d');
    context.lineJoin = "round";
    
    const length = await this.drawSharedMap.size;
    for(var i=this.lastSeen; i < length; i++) {		
      const item = await this.drawSharedMap.get<DrawItem>(i.toString());
      if (!item) {
        continue;
      }
      
      // Set color properties
      context.strokeStyle = item.color;
      context.lineWidth = item.lineWidth;

      context.beginPath();
      if(item.drag){
        const prevItem = await this.drawSharedMap.get<DrawItem>((i-1).toString());
        context.moveTo(prevItem.x, prevItem.y);
      } else{
        context.moveTo(item.x-1, item.y);
      }
      context.lineTo(item.x, item.y);
      context.closePath();
      context.stroke();
    }

    this.lastSeen = length;
  }

}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/counter", [
    ["@chaincode/counter", Promise.resolve(PragueDraw)]
  ]);
}

class DrawItem {
  constructor(
    public x: number,
    public y: number,
    public drag: boolean,
    public color: string,
    public lineWidth: number,
    ) {}
}