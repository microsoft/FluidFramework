import { IMapView } from "@prague/map";
import { initialize } from "./quiz/shared/choiceQuizViewModel";

export function initMcqView(view: IMapView, clientId: string) {
    initialize(true, view, clientId, undefined);
}
