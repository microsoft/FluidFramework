import { LoadPragueComponent } from '@prague/vanilla-loader';

export default async function loadPrague(url: string, token: string, div: HTMLDivElement) {
    LoadPragueComponent(url, () => Promise.resolve(token), div, "simple-prague-loader"); 
}