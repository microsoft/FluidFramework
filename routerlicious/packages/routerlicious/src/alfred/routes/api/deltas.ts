import { ISequencedDocumentMessage } from "@prague/runtime-definitions";
import { Router } from "express";
import { Provider } from "nconf";
import * as utils from "../../../utils";
import { IAlfredTenant } from "../../tenant";

const sequenceNumber = "sequenceNumber";

export async function getDeltaContents(
    mongoManager: utils.MongoManager,
    collectionName: string,
    tenantId: string,
    documentId: string,
    from?: number,
    to?: number): Promise<any[]> {

    // Create an optional filter to restrict the delta range
    const query: any = { documentId, tenantId };
    if (from !== undefined || to !== undefined) {
        query[sequenceNumber] = {};

        if (from !== undefined) {
            query[sequenceNumber].$gt = from;
        }

        if (to !== undefined) {
            query[sequenceNumber].$lt = to;
        }
    }

    // Query for the deltas and return a filtered version of just the operations field
    const db = await mongoManager.getDatabase();
    const collection = await db.collection<any>(collectionName);
    const dbDeltas = await collection.find(query, { sequenceNumber: 1 });

    return dbDeltas;
}

export async function getDeltas(
    mongoManager: utils.MongoManager,
    collectionName: string,
    tenantId: string,
    documentId: string,
    from?: number,
    to?: number): Promise<ISequencedDocumentMessage[]> {

    // Create an optional filter to restrict the delta range
    const query: any = { documentId, tenantId };
    if (from !== undefined || to !== undefined) {
        query["operation.sequenceNumber"] = {};

        if (from !== undefined) {
            query["operation.sequenceNumber"].$gt = from;
        }

        if (to !== undefined) {
            query["operation.sequenceNumber"].$lt = to;
        }
    }

    // Query for the deltas and return a filtered version of just the operations field
    const db = await mongoManager.getDatabase();
    const collection = await db.collection<any>(collectionName);
    const dbDeltas = await collection.find(query, { "operation.sequenceNumber": 1 });

    return dbDeltas.map((delta) => {
        const operation = delta.operation as ISequencedDocumentMessage;
        // Temporary workaround to handle old deltas where content type is object.
        if (typeof operation.contents === "string") {
            operation.contents = JSON.parse(operation.contents);
        }
        return operation;
    });
}

export function create(config: Provider, mongoManager: utils.MongoManager, appTenants: IAlfredTenant[]): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
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
        const tenantId = request.params.tenantId || appTenants[0].id;

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltas(
            mongoManager,
            deltasCollectionName,
            tenantId,
            request.params.id,
            from,
            to);

        deltasP.then(
            (deltas) => {
                response.status(200).json(deltas);
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    /**
     * Retrieves delta contents for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get("/content/:tenantId?/:id", (request, response, next) => {
        const from = stringToSequenceNumber(request.query.from);
        const to = stringToSequenceNumber(request.query.to);
        const tenantId = request.params.tenantId || appTenants[0].id;

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltaContents(
            mongoManager,
            "content",
            tenantId,
            request.params.id,
            from,
            to);

        deltasP.then(
            (deltas) => {
                response.status(200).json(deltas);
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    return router;
}
