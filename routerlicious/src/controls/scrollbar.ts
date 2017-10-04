import * as ui from "../ui";

// const scrollAreaWidth = 18;

export class Scrollbar extends ui.Component {
    public scrollDiv: HTMLDivElement;
    public scrollRect: ui.Rectangle;
    // private bubble: HTMLDivElement;
    // private bubbleDelta: number;

    // protected resizeCore(bounds: ui.Rectangle) {
    //     let panelScroll = bounds.nipHorizRight(FlowView.scrollAreaWidth);
    //     this.scrollRect = panelScroll[1];
    //     ui.Rectangle.conformElementToRect(this.scrollDiv, this.scrollRect);
    //     this.viewportRect = panelScroll[0].inner(0.92);
    //     ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
    //     this.render(this.topChar, true);
    // }

    // private addScrollbar() {
    //     let scrollbarWidth = 10;
    //     let scrollbar = document.createElement("div");
    //     bubble = document.createElement("div");

    //     let rect = ui.Rectangle.fromClientRect(listContainer.getBoundingClientRect());
    //     // adjust for 2px border
    //     rect.x = (rect.width - scrollbarWidth) - 4;
    //     rect.width = scrollbarWidth;
    //     rect.y = 0;
    //     rect.height -= 4;
    //     rect.conformElement(scrollbar);
    //     scrollbar.style.backgroundColor = "white";
    //     rect.y = 0;
    //     rect.x = 0;
    //     bubbleDelta = rect.height * (1 / items.length);
    //     rect.height = Math.round(itemCapacity * bubbleDelta);
    //     rect.conformElement(bubble);
    //     bubble.style.backgroundColor = "#cccccc";
    //     listContainer.appendChild(scrollbar);
    //     scrollbar.appendChild(bubble);
    //     scrollbar.style.zIndex = "2";
    // }

    // private adjustScrollbar() {
    //     bubble.style.top = Math.round(bubbleDelta * topSelection) + "px";
    // }

    // private makeScrollLosenge(height: number, left: number, top: number) {
    //     let div = document.createElement("div");
    //     div.style.width = "12px";
    //     div.style.height = `${height}px`;
    //     div.style.left = `${left}px`;
    //     div.style.top = `${top}px`;
    //     div.style.backgroundColor = "pink";
    //     let bordRad = height / 3;
    //     div.style.borderRadius = `${bordRad}px`;
    //     div.style.position = "absolute";
    //     return div;
    // }

    // let frac = this.topChar / len

    // clearSubtree(this.scrollDiv);
    // let bubbleHeight = Math.max(3, Math.floor((this.viewportCharCount() / len) * this.scrollRect.height));
    // let bubbleTop = Math.floor(frac * this.scrollRect.height);
    // let bubbleLeft = 3;
    // let bubbleDiv = makeScrollLosenge(bubbleHeight, bubbleLeft, bubbleTop);
    // this.scrollDiv.appendChild(bubbleDiv);

    // this.scrollDiv = document.createElement("div");
    // this.element.appendChild(this.scrollDiv);

    // if (bubble) {
    //     adjustScrollbar();
    // }

    // bubble = undefined;
    // if (items.length > itemCapacity) {
    //     setTimeout(addScrollbar, 0);
    // }
}
