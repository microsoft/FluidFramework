import { LoadPragueComponent } from '@prague/vanilla-loader';

export default async function loadPrague(url: string, token: string, div: HTMLElement) {
    LoadPragueComponent(url, token, div); 
}
