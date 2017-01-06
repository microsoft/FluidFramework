import React from 'react'
import ReactDOM from 'react-dom'

class InkColorSelector extends React.Component {
    componentDidMount() {
		this.postRender()
    }
    componentDidUpdate(prevProps, prevState) {
        this.postRender()
    }
    render() {
		return (<canvas className="inkColorSelector" ref="canvas" width={this.props.size} height={this.props.size} onClick={() => this.props.onSelect(this.props.color)} ></canvas>)
    }
    postRender() {
        let canvas = ReactDOM.findDOMNode(this.refs.canvas)
        let ctx = canvas.getContext('2d')
        ctx.strokeStyle = this.props.color
        ctx.beginPath();
        ctx.arc(20, 20, 19, 0, Math.PI * 2, false);
        ctx.stroke();
        ctx.closePath();
        ctx.fillStyle = (this.props.selected) ? this.props.color : 'rgb(255,255,255)'
        ctx.fill();
    }
}

export default InkColorSelector
