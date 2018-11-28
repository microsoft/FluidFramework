// tslint:disable
import { AxiosInstance, AxiosRequestConfig, default as Axios } from "axios";
import * as qs from "querystring";

export class RestWrapper {
    public maxContentLength = 1000 * 1024 * 1024;
    public baseurl?: string;
    public defaultHeaders?: {};
    public defaultQueryString?: {};

    constructor(
        private axios: AxiosInstance = Axios) {
    }

    public get<T>(url: string, queryString?: {}, headers?: {}): Promise<T> {
        const options: AxiosRequestConfig = {
            headers,
            maxContentLength: this.maxContentLength,
            method: "GET",
            baseURL: this.baseurl,
            url: `${url}${this.appendQueryString(queryString)}`,
        };
        return this.request(options, 200);
    }

    public post<T>(url: string, requestBody: any, queryString?: {}, headers?: {}): Promise<T> {
        const options: AxiosRequestConfig = {
            data: requestBody,
            headers,
            maxContentLength: this.maxContentLength,
            method: "POST",
            baseURL: this.baseurl,
            url: `${url}${this.appendQueryString(queryString)}`,
        };
        return this.request(options, 201);
    }

    public delete<T>(url: string, queryString?: {}, headers?: {}): Promise<T> {
        const options: AxiosRequestConfig = {
            headers,
            maxContentLength: this.maxContentLength,
            method: "DELETE",
            baseURL: this.baseurl,
            url: `${url}${this.appendQueryString(queryString)}`,
        };
        return this.request(options, 204);
    }

    public patch<T>(url: string, requestBody: any, queryString?: {}, headers?: {}): Promise<T> {
        const options: AxiosRequestConfig = {
            data: requestBody,
            headers,
            maxContentLength: this.maxContentLength,
            method: "PATCH",
            baseURL: this.baseurl,
            url: `${url}${this.appendQueryString(queryString)}`,
        };
        return this.request(options, 200);
    }

    private async request<T>(options: AxiosRequestConfig, statusCode: number): Promise<T> {
        if (this.defaultHeaders) {
            options.headers = { ...this.defaultHeaders, ...options.headers }
        }

        const response = await this.axios.request<T>(options)
            .catch((error) => error.response && error.response.status !== statusCode
                ? Promise.reject(error.response.status)
                : Promise.reject(error));
        return response.data;
    }

    private appendQueryString(queryString: {}) {
        if (this.defaultQueryString || queryString) {
            return `?${qs.stringify({...this.defaultQueryString, ...queryString})}`;
        }

        return "";
    }
}