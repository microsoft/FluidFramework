/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { queue } from "async";
import { Router } from "express";
import * as request from "request";
import * as helper from "../helper"
import * as service from "../service";

interface ITask {
    // Request text to spellcheck.
    text: string;

    // Reference sequence number.
    rsn: number;

    // Start position.
    start: number;

    // End position
    end: number;

    // Response associated with the request.
    response: any;
};

const router: Router = Router();

/**
 * Writes to input file and invokes spellchecker service.
 */
async function invokeExecutable(text: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        service.writeFile("../../../../app/ParameterCollection.json", text).then(() => {
            service.runCommand("../../../../app", "dotnet editorservicerelay.dll").then((data) => {
                    // Converts the console output to JSON.
                    resolve(helper.extractJSON(data));
            }, (error) => {
                reject(error);
            });
        }, (error) => {
            reject(error);
        });
    });
}

/**
 * Invokes REST API directly.
 */
async function invokeRestAPI(text: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        request.post({url:'https://nleditor.osi.office.net/NlEditor/Check/V1/',
            form: {
                AppId: 'NLServiceTestAutomation',
                RequestId: '{B025D6F9-1C19-4207-A830-264A8CBC8BB1}',
                Text: text,
                LanguageId: 'en-us',
                RunOnProfileId: '{24BCFF65-03B5-40E9-90C8-59B75ABD453C}',
                TextUnit: 'Paragraph',
                Descriptors: [
                    {
                        Name: 'LicenseType',
                        Value: 'Subscription',
                    },
                ],
            },
            json: true,
        },
        (error, result, body) => {
            if (error) {
                return reject(error);
            } else if (result.statusCode !== 200) {
                return reject(result);
            }
            return resolve(body);
        });
    });
}

// queue to process requests sequentially. Callback invoked to process the next request for both success/error case.
const qContainer = queue((task: ITask, callback) => {
    console.info(`Container input -> Text: ${task.text} RSN: ${task.rsn} Start: ${task.start} End: ${task.end}`);
    const resultP = invokeExecutable(task.text);
    resultP.then((result) => {
        task.response.status(200).json({
            answer: result,
            text: task.text,
            rsn: task.rsn,
            start: task.start,
            end: task.end
        });
        callback();
    }, (error) => {
        task.response.status(400).json({ error });
        callback();
    });
}, 1);

// queue to process requests sequentially. Callback invoked to process the next request for both success/error case.
const qDirect = queue((task: ITask, callback) => {
    console.info(`REST input -> Text: ${task.text} RSN: ${task.rsn} Start: ${task.start} End: ${task.end}`);
    const resultP = invokeRestAPI(task.text);
    resultP.then((result) => {
        task.response.status(200).json({
            answer: result,
            text: task.text,
            rsn: task.rsn,
            start: task.start,
            end: task.end
        });
        callback();
    }, (error) => {
        task.response.status(400).json({ error });
        callback();
    });
}, 1);

/**
 * Returns spellchecker result for the given string by invoking the executable inside the container.
 */
router.post("/", async (request, response, next) => {
    const text = request.body.documents[0].text;
    const rsn = request.body.documents[0].rsn;
    const start = request.body.documents[0].start;
    const end = request.body.documents[0].end;
    qContainer.push( {text, rsn, start, end, response});
});

/**
 * Returns spellchecker result for the given string via invoking the REST API directly.
 */
router.post("/api", async (request, response, next) => {
    const text = request.body.documents[0].text;
    const rsn = request.body.documents[0].rsn;
    const start = request.body.documents[0].start;
    const end = request.body.documents[0].end;
    qDirect.push( {text, rsn, start, end, response});
});

export default router;
