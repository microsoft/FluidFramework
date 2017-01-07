import React from 'react'
import ReactDOM from 'react-dom'

class InkColorSelector extends React.Component {
    componentDidMount() {
		this.postRender()
    }
    componentDidUpdate(prevProps, prevState) {
        this.postRender()
    }
    createRainbowInkGradient(ctx, x, y, w, h) {
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
    render() {
		return (<canvas className="inkColorSelector" ref="canvas" width={this.props.size} height={this.props.size} onClick={() => this.props.onSelect(this.props.color)} ></canvas>)
    }
    postRender() {
        let canvas = ReactDOM.findDOMNode(this.refs.canvas)
        let ctx = canvas.getContext('2d')
        let color = (this.props.color == 'rainbow' ? this.createRainbowInkGradient(ctx, 0, 0, 40, 0) : this.props.color)
        ctx.strokeStyle = color
        ctx.beginPath();
        ctx.arc(20, 20, 19, 0, Math.PI * 2, false);
        ctx.stroke();
        ctx.closePath();
        ctx.fillStyle = (this.props.selected) ? color : 'rgb(255,255,255)'
        ctx.fill();
    }
}

export default InkColorSelector
