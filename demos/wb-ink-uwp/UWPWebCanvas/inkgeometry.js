import React from 'react'
import ReactDOM from 'react-dom'

function lineAngle(pt1, pt2)
{
    let angle = Math.atan2(pt1.y - pt2.y, pt1.x - pt2.x) + Math.PI
	return (angle < 2 * Math.PI ? angle : angle - 2 * Math.PI)
}

class InkGeometry extends React.Component {
    constructor(props) {
        super(props)
        var points = []
        if (this.props.points !== undefined) {
            points = this.props.points
        }
        else {
            var count = 3//Math.round(3 + Math.random() * 3)
            for (var i = 0; i < count; i++) {
                points.push({
                    x: 50 + Math.random() * 150,
                    y: 50 + Math.random() * 150
                })
            }
        }
		this.renderPoints = points
		this.state = {
			points: points //[{x: 100, y: 100}, {x: 200, y: 100}, {x: 100, y: 200}]
        }

        this.movingVertex = -1

        this.pointerDown = this.pointerDown.bind(this);
        this.pointerMove = this.pointerMove.bind(this);
        this.pointerUp = this.pointerUp.bind(this);
	}
    componentDidMount() {
		this.postRender()
    }
    componentDidUpdate(prevProps, prevState) {
        this.postRender()
    }
    render() {
        return (<canvas className="inkGeometry" ref="canvas" left={this.props.left} top={this.props.top } width={this.props.width} height={this.props.height} ></canvas>)
    }
    postRender() {
        let canvas = ReactDOM.findDOMNode(this.refs.canvas)
        canvas.addEventListener("pointerdown", this.pointerDown);
        canvas.addEventListener("pointermove", this.pointerMove);
        canvas.addEventListener("pointerup", this.pointerUp);

        let ctx = canvas.getContext('2d')
		ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.strokeStyle = (this.props.color !== undefined ? this.props.color : 'rgb(0,0,0)')
		ctx.fillStyle = ctx.strokeStyle

		// Lines
        ctx.beginPath();
		ctx.moveTo(this.renderPoints[0].x, this.renderPoints[0].y)
		for (let pt of this.renderPoints.slice(1)) {
			ctx.lineTo(pt.x, pt.y)
		}
        ctx.closePath();
        ctx.stroke();

		// Angles
		for (var i=0; i < this.renderPoints.length; i++) {
            let theta1 = lineAngle(this.renderPoints[i], this.renderPoints[(i - 1 + this.renderPoints.length) % this.renderPoints.length])
            let theta2 = lineAngle(this.renderPoints[i], this.renderPoints[(i + 1) % this.renderPoints.length])

            var start = Math.min(theta1, theta2)
            var theta = Math.abs(theta2 - theta1)
            if (theta > Math.PI) {
                start = Math.max(theta1, theta2)
				theta = 2 * Math.PI - theta
            }
			
			ctx.beginPath()
			ctx.arc(this.renderPoints[i].x, this.renderPoints[i].y, 20, start, start + theta, false);
			let text = "" + Math.round(theta * 360 / (Math.PI * 2))
			ctx.fillText(text, this.renderPoints[i].x, this.renderPoints[i].y)
			ctx.stroke()
		}
    }
    closestPoint(test, points) {
        var closest = 0
        var distance = Number.MAX_VALUE
        for (var i = 0; i < points.length; i++) {
            let d = Math.hypot(test.x - points[i].x, test.y - points[i].y)
            if (d < distance) {
                closest = i
				distance = d
            }
        }
		return closest
    }
    pointerDown(event) {
        let pt = { x: event.clientX, y: event.clientY }
        let vertex = this.closestPoint(pt, this.state.points)
        let d = Math.hypot(pt.x - this.state.points[vertex].x, pt.y - this.state.points[vertex].y)
        if (d < 20) {
            this.movingVertex = vertex
        }
	}
	pointerMove(event) {
		if (this.movingVertex != -1) {
            let pt = { x: event.clientX, y: event.clientY }
            this.renderPoints[this.movingVertex] = pt
			this.postRender()
		}
	}
	pointerUp(event) {
        if (this.movingVertex != -1) {
            this.setState({
				points: this.renderPoints
            })
		}
		this.movingVertex = -1
	}
}

export default InkGeometry
