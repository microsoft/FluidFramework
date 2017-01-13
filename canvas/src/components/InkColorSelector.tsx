import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as InkUtils from "../inkutils"

class InkColorSelector extends React.Component<any, any> {
    componentDidMount() {
		this.postRender()
    }
    componentDidUpdate(prevProps: any, prevState: any) {
        this.postRender()
    }
    render() {
		return (<canvas className="inkColorSelector" ref="selector" width={this.props.size} height={this.props.size} onClick={() => this.props.onSelect(this.props.color)} ></canvas>)
    }
    postRender() {
        const canvas: any = ReactDOM.findDOMNode(this.refs["selector"]);
        const ctx = canvas.getContext('2d')
        const color = (this.props.color == 'rainbow' ? InkUtils.createRainbowInkGradient(ctx, 0, 0, 40, 0) : this.props.color)
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(20, 20, 19, 0, Math.PI * 2, false);
        ctx.stroke();
        ctx.closePath();
        ctx.fillStyle = (this.props.selected) ? color : 'rgb(255,255,255)'
        ctx.fill();
    }
}

export default InkColorSelector
