// for now, just give types to the global symbols
// next, put the global symbols into a module

interface IPoint {
    x: number;
    y: number;
}

interface IClient {
    isBrowserSupported(): boolean;
    IS_POINTER: boolean;
    IS_TOUCH: boolean;
}
declare var mxClient: IClient;

interface IUtils {
    error(msg: string, code: number, b: boolean)
    convertPoint(container: HTMLElement, x: number, y: number):IPoint;
    bind(obj: any, fn: Function): Function;
}
declare var mxUtils: IUtils;

interface IEvent {

}
interface IEventHandler {
    (event:IEvent):void;
}

interface IEvents {
    disableContextMenu(elm: HTMLElement);
    addListener(node, evType: string, handler: IEventHandler);
    CLICK: string;
    DONE: string;
    CONNECT: string;
    getClientX(event: IEvent): number;
    getClientY(event: IEvent): number;
    consume(event: IEvent);
    isMouseEvent(event: IEvent): boolean;
}

declare var mxEvent: IEvents;

interface IShape {
    node;
}

interface ICell {
}

interface IVertex extends ICell {
    sharedId?: string;
}

interface IPanningHandler {
    useLeftButtonForPanning: boolean;
}

interface IConnectionHandler {
    select: boolean;
    start(state,x:number,y:number);
    addListener(evType: string, handler: ()=>void);
}

interface IView {
    setTranslate(x: number, y: number);
    refresh(vertex: IVertex)
}

declare class mxRubberband {
    constructor(graph: mxGraph);
}

interface IGeometry {
    x: number;
    y: number;
}

interface IEdge {
    label: string;
}

interface IPopupMenuHandler {
    hideMenu();
}

declare class mxGraph {
    panningHandler: IPanningHandler;
    connectionHandler: IConnectionHandler;
    popupMenuHandler: IPopupMenuHandler;
    view: IView;
    container: HTMLElement;
    isMouseDown: boolean;
    isMouseTrigger: boolean;
    constructor(container: HTMLElement);
    getDefaultParent(): ICell;
    setPanning(on: boolean);
    setAllowDanglingEdges(allow: boolean);
    clearSelection();
    getCellGeometry(cell: ICell) : IGeometry;
    insertVertex(parent: ICell,aux,label:string,x: number,y:number,width:number, height:number):IVertex;
    insertEdge(parent: ICell,aux, label: string, cell: ICell, vertex: IVertex):IEdge;
    scrollCellToVisible(cell: ICell);
    stopEditing(stop: boolean);  
    addCellOverlay(cell: ICell, overlay: mxCellOverlay);  
    getModel(): mxGraphModel;
    resizeCell: () => void;
}

declare class mxEventObject {
    constructor(evType: string,...options);
}

declare class mxCellRenderer {
    installCellOverlayListeners(state,overlay,shape:IShape);
}

declare class mxImage {
    constructor(path: string, xsize: number, ysize: number);
}

interface IOverlayEventHandler {
    (sender, event):void;
}

declare class mxCellOverlay {
    cursor: string;
    constructor(img: mxImage, msg: string);
    addListener(evType: string, handler: IOverlayEventHandler);
    fireEvent(evObj: mxEventObject,...options);
}

declare class mxGraphModel {
    beginUpdate();
    endUpdate();
}

interface IConstants {
    DIRECTION_WEST: string;
}
declare var mxConstants: IConstants; 

declare class mxHierarchicalLayout {
    constructor(graph: mxGraph, direction: string);
    execute(cell: ICell, root: IVertex);
}

declare class mxMorphing {
    constructor(graph: mxGraph);
    addListener(evType: string, handler: Function);
    startAnimation();
}

declare class mxEdgeHandler {
    connect(edge,terminal,isSource:boolean,isClone:boolean,me);
}


