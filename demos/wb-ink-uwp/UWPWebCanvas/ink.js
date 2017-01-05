function draw(current, previous) {
    var ctx = $("#inkcanvas")[0].getContext("2d");
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
}

var inking = false;
var lastPoint = {}
$("#inkcanvas").on("pointermove", function (event) {
    if (inking) {
        var point = { x: event.clientX, y: event.clientY };
        draw(point, lastPoint);
        lastPoint = point;
    }
});

$("#inkcanvas").on("pointerdown", function (event) {
    inking = true;
    lastPoint = { x: event.clientX, y: event.clientY };
});

$("#inkcanvas").on("pointerup", function (event) {
    inking = false;
});

var resize = () => {
    var canvas = document.getElementById("inkcanvas");
    canvas.width = $(window).innerWidth();//document.body.clientWidth;
    canvas.height = $(window).innerHeight(); //document.body.clientHeight;
};
$(window).resize(resize);