// TODO convert me
// tslint:disable

import * as express from 'express';
import * as request from 'request';
import * as moment from 'moment';
import * as accounts from '../accounts';
import { Promise } from 'es6-promise';
import { IUser } from '../accounts';
import * as nconf from 'nconf';
import { defaultPartials } from './partials';

var google = require('googleapis');
var googleAuth = require('google-auth-library');

var router = express.Router();

interface ExcelTest {
    success: boolean;
    error?: any;
}

router.get('/', (req: express.Request, response: express.Response) => {
    let user = <IUser>(<any>req).user;

    if (!user) {
        return response.json([]);
    }

    for (let account of user.accounts) {
        if (account.provider === 'microsoft') {
            var excelTest = new Promise<ExcelTest>((resolve, reject) => {
                return accounts.getTokens(account).then((tokens) => {
                    let url = 'https://graph.microsoft.com/v1.0/me/drive/root:/BookService.xlsx:/workbook/createSession';
                    request.post(
                        url,
                        {
                            auth: { 'bearer': tokens.access },
                            json: true,
                            body: { persistChanges: false }
                        }, (error, response, body) => {
                            if (error) {
                                return reject({ success: false, error: error });
                            }
                            else {
                                console.log(body);
                                let sessionId = body.id;
                                let sessionURL = 'https://graph.microsoft.com/v1.0/me/drive/root:/BookService.xlsx:/workbook/worksheets';
                                request.get(
                                    sessionURL,
                                    {
                                        auth: { 'bearer': tokens.access },
                                        json: true,
                                        headers: { "workbook-session-id": sessionId },
                                    }, (error, response, body) => {
                                        if (error) {
                                            console.log(error);
                                        }
                                        else {
                                            console.log(body);
                                            let sheetURL = "https://graph.microsoft.com/v1.0/me/drive/root:/BookService.xlsx:/workbook/worksheets('Sheetaki')/cell(row=0, column=0)";
                                            request.patch(
                                                sheetURL,
                                                {
                                                    auth: { 'bearer': tokens.access },
                                                    json: true,
                                                    headers: { "workbook-session-id": sessionId },
                                                    body: { values: 10 },
                                                }, (error, response, body) => {
                                                    if (error) {
                                                        console.log(error);
                                                    }
                                                    else {
                                                        console.log(body);
                                                        let sheetURL = "https://graph.microsoft.com/v1.0/me/drive/root:/BookService.xlsx:/workbook/worksheets('Sheetaki')/cell(row=1, column=1)";
                                                        request.get(
                                                            sheetURL,
                                                            {
                                                                auth: { 'bearer': tokens.access },
                                                                json: true,
                                                                headers: { "workbook-session-id": sessionId },
                                                            }, (error, response, body) => {
                                                                if (error) {
                                                                    console.log(error);
                                                                }
                                                                else {
                                                                    console.log(body);
                                                                }
                                                            }
                                                        );
                                                    }
                                                }
                                            );
                                        }
                                    }
                                );
                                let et = { success: true };
                                return resolve(et);
                            }
                        }
                    );
                });
            });
        }
    }

    return response.json([]);
});


export = router;