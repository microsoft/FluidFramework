export function createRainbowInkGradient(ctx: any, w: number, h: number, x: number = 0, y: number = 0) {
    var grd = ctx.createLinearGradient(x, y, w, h)
    grd.addColorStop(0, '#D9492D')
    grd.addColorStop(0.15, '#E16D15')
    grd.addColorStop(0.3, '#F1CF67')
    grd.addColorStop(0.45, '#4AAE58')
    grd.addColorStop(0.6, '#57B2BF')
    grd.addColorStop(0.75, '#2A5091')
    grd.addColorStop(0.9, '#35175B')
    grd.addColorStop(0.9, '#35175B')
    return grd
}


export default createRainbowInkGradient