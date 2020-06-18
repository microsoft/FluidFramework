// import { PrimedComponent, ISharedComponentProps } from "@fluidframework/aqueduct";
// import { IComponentHTMLView } from "@fluidframework/view-interfaces";

// import ReactDOM from "react-dom";

// import { FluidContext } from "./useFluidMap";

// interface Props extends ISharedComponentProps<never> {
//     element: JSX.Element;
// }

// export class InternalFluidReactComponent extends PrimedComponent implements IComponentHTMLView {
//     private element: JSX.Element;
//     get IComponentHTMLView() { return this; }

//     public constructor(props: Props) {
//         super(props);
//         this.element = props.element;
//     }

//     public render(div: HTMLElement) {
//         const reactContext = {
//             useMap: generateUseFluidMap(root),
//             useReducer: generateUseFluidReducer(root),
//         };
//         ReactDOM.render(
//             <FluidContext.Provider value={reactContext}>
//                 {this.element}
//             </FluidContext.Provider>,
//             div);
//     }
// }
