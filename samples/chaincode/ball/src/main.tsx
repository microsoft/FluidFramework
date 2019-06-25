import {
  IComponent,
  IComponentHTMLViewable,
  IComponentRouter,
  IHTMLView,
  IRequest,
  IResponse,
  ISharedComponent,
} from "@prague/container-definitions";
import {
  ISharedMap,
  MapExtension,
} from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";

interface ICoordinates {
  x: number,
  y: number
}

// Is this a view or an instance?
export class BallView implements IHTMLView {
  private div: HTMLDivElement;

  constructor(private ballInstance: BallInstance, parent: HTMLDivElement) {
    if (parent) {
      this.div = document.createElement("div");
      parent.appendChild(this.div);

      this.div.style.position = "absolute";
      this.div.style.minWidth = "50px";
      this.div.style.minHeight = "50px";
      this.div.style.top = "50px";
      this.div.style.left = "50px";
      this.div.style.borderRadius = "100%";
      this.div.style.background = "blue";

      this.div.style.display = "flex";
      this.div.style.alignItems = "center";
      this.div.style.justifyContent = "center";
      this.div.style.verticalAlign = "center";

      const p = document.createElement("p");

      p.textContent = this.ballInstance.url;
      this.div.appendChild(p);

      let prevX = 50;
      let prevY = 50;
      let x = 50;
      let y = 50;
      let beingdragged = false;

      const mouseDown = (e: MouseEvent) => {
        beingdragged = true;
        prevX = x - (event.target as any).offsetLeft;
        prevY = y - (event.target as any).offsetTop;
      }
      this.div.onmousedown = mouseDown;
      p.onmousedown = mouseDown;

      parent.onmousemove = (e: MouseEvent) => {

        if (e.pageX) {
          x = e.pageX;
          y = e.pageY;
        }

        if (beingdragged) {
          const curX = (e.pageX - prevX);
          const curY = (e.pageY - prevY);
          this.div.style.left = curX + 'px';
          this.div.style.top = curY + 'px';
          this.ballInstance.reportCoordinates(curX, curY);
        }
      }

      document.onmouseup = () => {
        beingdragged = false;
      }
    }
  }

  changeLocation(newCoords: ICoordinates) {
    this.div.style.left = newCoords.x + 'px';
    this.div.style.top = newCoords.y + 'px';
  }

  remove() {
    throw new Error("Method not implemented.");
  }
}

export class BallInstance implements ISharedComponent, IComponentHTMLViewable, IComponentRouter {
  public static type = "BallInstance";

  public static supportedInterfaces = ["IComponentLoadable", "IComponentHTMLViewable", "IComponentRouter"];
  private view: BallView;
  private coordinates: ICoordinates;

  constructor(public url: string, private collection: BallCollection) { }

  public query(id: string): any {
    return BallInstance.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
  }

  public list(): string[] {
    return BallInstance.supportedInterfaces;
  }

  public async addView(host: IComponent, element: HTMLDivElement): Promise<IHTMLView> {
    element.style.width = "100%";
    element.style.height = "100%";

    this.view = new BallView(this, element)
    return this.view;
  }

  public reportCoordinates(x: number, y: number) {
    this.coordinates = { x, y };
    this.collection.changePosition(this.url, { x, y });
  }

  public render(coords: ICoordinates) {
    this.coordinates = coords;
    this.view.changeLocation(this.coordinates)
  }

  public async request(request: IRequest): Promise<IResponse> {
    return {
      mimeType: "prague/component",
      status: 200,
      value: this,
    };
  }
}


export abstract class BaseCollection extends EventEmitter {
  public static supportedInterfaces: string[];
  url: string;
  protected root: ISharedMap;

  constructor(private runtime: IComponentRuntime, context: IComponentContext) {
    super();
    this.url = context.id;
  }

  async initializeCore() {
    if (!this.runtime.existing) {
      this.root = this.runtime.createChannel("root", MapExtension.Type) as ISharedMap;
      this.root.attach();
    } else {
      this.root = await this.runtime.getChannel("root") as ISharedMap;
    }
  }
}


export class BallCollection extends BaseCollection implements ISharedComponent, IComponentHTMLViewable, IComponentRouter {
  public static type = "BallCollection";
  public static supportedInterfaces = ["IComponentLoadable", "IComponentRouter", "IComponentHTMLViewable"];
  public static async Load(runtime: IComponentRuntime, context: IComponentContext) {
    const collection = new BallCollection(runtime, context);
    await collection.initialize();

    return collection;
  }

  root: ISharedMap;
  private ballInstances = new Map<string, BallInstance>();

  public async initialize() {
    await this.initializeCore();

    if (this.root.size > 0) {
      for (const [key, value ] of this.root.entries()) {
        this.addBall(key, value as ICoordinates);
      }
    } else {
      const instanceId = "First_Ball";
      this.addBall(instanceId);
    }

    const update = async (changed, local) => {
      if (!local) {
        const instance = this.ballInstances.get(changed.key);
        const coords = await this.root.get<ICoordinates>(changed.key);
        instance.render(coords);
      }
    }
    this.root.on("op", update);
    this.root.on("valueChanged", update);
  }

  public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {

    // UI on Collection to add more balls
    const ballName = document.createElement("input");
    ballName.type = "input";
    element.appendChild(ballName);
    const addBall = document.createElement("input");
    addBall.type = "button";
    addBall.value = "+";
    addBall.onclick = async () => {
      await this.addBall(ballName.value);
      ballName.value = "";
    };
    element.appendChild(addBall);

    // Add the view for every ball
    this.ballInstances.forEach((ball: BallInstance) => {
      ball.addView(host, element as HTMLDivElement);
    })
    return element;
  }

  public changePosition(key: string, coordinates: ICoordinates) {
    this.root.set(key, coordinates);
  }

  public query(id: string): any {
    return BallCollection.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
  }

  public list(): string[] {
    return BallCollection.supportedInterfaces;
  }

  public async request(request: IRequest): Promise<IResponse> {
    const trimmed = request.url
      .substr(1)
      .substr(0, request.url.indexOf("/", 1) === -1 ? request.url.length : request.url.indexOf("/"));

    if (!trimmed) {
      return {
        mimeType: "prague/component",
        status: 200,
        value: this,
      };
    }

    // We could create a ball at the new URI, but that'd be like changing data on a get
    if (!this.root.has(trimmed)) {
      console.log("There's no ball here.");
      // e.g. await this.ballInstances.set(trimmed, new BallInstance(trimmed, this));
    }
    return this.ballInstances.get(trimmed).request({ url: trimmed.substr(1 + trimmed.length) });
  }

  async addBall(ballName: string, coords?: ICoordinates) {
    if (!this.ballInstances.has(ballName)) {
      const ball = new BallInstance(ballName, this);
      await this.ballInstances.set(ballName, ball);
      this.root.set(ballName, coords ? coords : {x: 50, y: 50});
    }
  }
}
