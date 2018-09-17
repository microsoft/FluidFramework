import { IMapView } from "@prague/map";
import { initialize } from "./quiz/shared/choiceQuizViewModel";

export function initMcqView(view: IMapView) {
    initialize(true, view, undefined);
}
