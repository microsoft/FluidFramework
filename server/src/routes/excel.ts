import { Promise } from "es6-promise";
import * as express from "express";
import * as googleAuth from "google-auth-library";
import * as google from "googleapis";
import * as moment from "moment";
import * as nconf from "nconf";
import * as request from "request";
import * as accounts from "../accounts";
import { defaultPartials } from "./partials";

// tslint:disable:no-console
// tslint:disable:max-line-length

let router = express.Router();

interface IExcelTest {
    success: boolean;
    error?: any;
}

router.get("/", (req: express.Request, response: express.Response) => {
    let user = <accounts.IUser> (<any> req).user;

    if (!user) {
        return response.json([]);
    }

    for (let account of user.accounts) {
        if (account.provider === "microsoft") {
            let excelTest = new Promise<IExcelTest>((resolve, reject) => {
                return accounts.getTokens(account).then((tokens) => {
                    let createSessionUrl = "https://graph.microsoft.com/v1.0/me/drive/root:/BookService.xlsx:/workbook/createSession";
                    request.post(
                        createSessionUrl,
                        {
                            auth: { bearer: tokens.access },
                            body: { persistChanges: false },
                            json: true,
                        }, (sessionError, sessionResponse, sessionBody) => {
                            if (sessionError) {
                                return reject({ success: false, error: sessionError });
                            } else {
                                console.log(sessionBody);
                                let sessionId = sessionBody.id;
                                let sessionURL = "https://graph.microsoft.com/v1.0/me/drive/root:/BookService.xlsx:/workbook/worksheets";
                                request.get(
                                    sessionURL,
                                    {
                                        auth: { bearer: tokens.access },
                                        headers: { "workbook-session-id": sessionId },
                                        json: true,
                                    }, (worksheetError, worksheetResponse, worksheetBody) => {
                                        if (worksheetError) {
                                            console.log(worksheetError);
                                        } else {
                                            console.log(worksheetBody);
                                            request.patch(
                                                "https://graph.microsoft.com/v1.0/me/drive/root:/BookService.xlsx:/workbook/worksheets('Sheetaki')/cell(row=0, column=0)",
                                                {
                                                    auth: { bearer: tokens.access },
                                                    body: { values: 10 },
                                                    headers: { "workbook-session-id": sessionId },
                                                    json: true,
                                                }, (cellError, cellResponse, cellBody) => {
                                                    if (cellError) {
                                                        console.log(cellError);
                                                    } else {
                                                        console.log(cellBody);
                                                        request.get(
                                                            "https://graph.microsoft.com/v1.0/me/drive/root:/BookService.xlsx:/workbook/worksheets('Sheetaki')/cell(row=1, column=1)",
                                                            {
                                                                auth: { bearer: tokens.access },
                                                                headers: { "workbook-session-id": sessionId },
                                                                json: true,
                                                            }, (secondCellError, secondCellResponse, secondCellBody) => {
                                                                if (secondCellError) {
                                                                    console.log(secondCellError);
                                                                } else {
                                                                    console.log(secondCellBody);
                                                                }
                                                            },
                                                        );
                                                    }
                                                },
                                            );
                                        }
                                    },
                                );
                                let et = { success: true };
                                return resolve(et);
                            }
                        },
                    );
                });
            });
        }
    }

    return response.json([]);
});

export = router;
