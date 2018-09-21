import * as builder from "botbuilder";
import { VSTSRequestAPI } from "./VSTSRequestAPI";
import * as querystring from "querystring";

export class VSTSAPI {

    private requestAPI: VSTSRequestAPI;

    constructor () {
        this.requestAPI = new VSTSRequestAPI();
    }

    public async getWorkItem(id: string, session: builder.Session): Promise<any> {
        let args = {
            "ids": id,
            "api-version": "1.0",
        };
        let url = "https://teamsbot.visualstudio.com/DefaultCollection/_apis/wit/workitems?" + querystring.stringify(args);
        let resp = await this.requestAPI.getAsync(url, session);
        let body = JSON.parse(resp);
        return body;
    }
}
