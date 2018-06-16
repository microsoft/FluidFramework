import * as api from "@prague/routerlicious/dist/api-core";
import { Router } from "express";
import { Provider } from "nconf";

export async function getDeltas(
    documentId: string,
    from?: number,
    to?: number): Promise<api.ISequencedDocumentMessage[]> {

    return [];
}

export function create(config: Provider): Router {
    const router: Router = Router();

    function stringToSequenceNumber(value: string): number {
        const parsedValue = parseInt(value, 10);
        return isNaN(parsedValue) ? undefined : parsedValue;
    }

    /**
     * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get("/:tenantId?/:id", (request, response, next) => {
        const from = stringToSequenceNumber(request.query.from);
        const to = stringToSequenceNumber(request.query.to);

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltas(request.params.id, from, to);
        deltasP.then(
            (deltas) => {
                response.status(200).json(null);
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    return router;
}
