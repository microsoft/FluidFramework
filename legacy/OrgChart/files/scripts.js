var margin = { top: 20, right: 120, bottom: 20, left: 120 };

var i = 0;
var duration = 750;
var root;

var viewWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0) - 100;
var viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0) - 100;

// size of the diagram
var width = viewWidth - margin.left - margin.right;
var height = viewHeight - margin.top - margin.bottom;

var tree = d3.layout.tree()
    .size([height, width])
    .sort(function (a, b) {
        var aName = a.employee.Name.toLowerCase();
        var bName = b.employee.Name.toLowerCase();
        return aName < bName ? -1 : (aName > bName ? 1 : 0);
    });

var diagonal = d3.svg.diagonal()
    .projection(function (d) { return [d.y, d.x]; });

var svg = d3.select("body").append("svg")
    .attr("width", width + margin.right + margin.left)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

function getEmployee(alias, callback) {
    $.ajax({
        url: '/api/EmployeeByAlias/' + alias,
    }).done(function (json) {
        console.log(json);
        callback(null, json);
    });
}

function getEmployeeById(id, callback) {
    $.ajax({
        url: '/api/EmployeeById/' + id,
    }).done(function (json) {
        console.log(json);
        callback(null, json);
    });
}

function getManager(id) {
    if (id != 0) {
        getEmployeeById(id, function (err, employee) {
            if (err) {
                throw err;
            }

            var manager = createNode(employee, true);
            manager.children.push(root);
            root = manager;
            root.x0 = height / 2;
            root.y0 = 0;
            update(root);

            getManager(employee.ManagerEmployeeId);
        });
    }
}

getEmployee('yangg', function (err, employee) {
    if (err) {
        throw err;
    }

    root = createNode(employee, true);
    root.x0 = height / 2;
    root.y0 = 0;
    update(root);

    getManager(employee.ManagerEmployeeId);
});

function createNode(employee, isMarked) {
    return {
        name: employee.Name,
        children: [],
        employee: employee,
        reportsPopulated: false,
        isMarked: isMarked,
        hasReports: employee.FullTimeReports + employee.VendorReports > 0,
    };
}


// d3.select(self.frameElement).style("height", "800px");

function update(source) {

    // Compute the new tree layout.
    var nodes = tree.nodes(root).reverse(),
        links = tree.links(nodes);

    // Normalize for fixed-depth.
    nodes.forEach(function (d) { d.y = d.depth * 180; });

    // Update the nodes?
    var node = svg.selectAll("g.node")
        .data(nodes, function (d) { return d.id || (d.id = ++i); });

    // Enter any new nodes at the parent's previous position.
    var nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", function (d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
        .on("click", click);

    nodeEnter.append("circle")
        .on("mouseover", mouseover)
        .on("mousemove", function (d) { mousemove(d); })
        .on("mouseout", mouseout)
        .attr("r", 1e-6)
        .style("fill", function (d) { return d.hasReports ? "lightsteelblue" : "#fff"; })
        .style('stroke', function (d) { return d.isMarked ? "red" : "steelblue" });

    nodeEnter.append("text")
        .attr("x", -10)
        .attr("dy", ".35em")
        .attr("text-anchor", "end")
        .text(function (d) { return d.name; })
        .style("fill-opacity", 1e-6);

    // Transition nodes to their new position.
    var nodeUpdate = node.transition()
        .duration(duration)
        .attr("transform", function (d) { return "translate(" + d.y + "," + d.x + ")"; });

    nodeUpdate.select("circle")
        .attr("r", 4.5)
        .style("fill", function (d) { return d.hasReports ? "lightsteelblue" : "#fff"; });

    nodeUpdate.select("text")
        .style("fill-opacity", 1);

    // Transition exiting nodes to the parent's new position.
    var nodeExit = node.exit().transition()
        .duration(duration)
        .attr("transform", function (d) { return "translate(" + source.y + "," + source.x + ")"; })
        .remove();

    nodeExit.select("circle")
        .attr("r", 1e-6);

    nodeExit.select("text")
        .style("fill-opacity", 1e-6);

    // Update the links?
    var link = svg.selectAll("path.link")
        .data(links, function (d) { return d.target.id; });

    // Enter any new links at the parent's previous position.
    link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", function (d) {
            var o = { x: source.x0, y: source.y0 };
            return diagonal({ source: o, target: o });
        });

    // Transition links to their new position.
    link.transition()
        .duration(duration)
        .attr("d", diagonal);

    // Transition exiting nodes to the parent's new position.
    link.exit().transition()
        .duration(duration)
        .attr("d", function (d) {
            var o = { x: source.x, y: source.y };
            return diagonal({ source: o, target: o });
        })
        .remove();

    // Stash the old positions for transition.
    nodes.forEach(function (d) {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}

function getReports(node, callback) {
    $.ajax({
        url: '/api/Reports/' + node.employee.EmployeeId,
    }).done(function (reports) {
        callback(null, reports);
    });
}

var div = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 1e-6);

function mouseover() {
    div.transition()
        .duration(300)
        .style("opacity", 1);
}

function mousemove(d) {
    var tooltip =
        d.name + "<br>" +
        d.employee.Alias + "<br>" +
        d.employee.Title + "<br>";

    if (d.employee.Office) {
        tooltip += d.employee.Office;
    }

    div
        .html(tooltip)
        .style("left", (d3.event.pageX + 10) + "px")
        .style("top", (d3.event.pageY + 10) + "px");
}

function mouseout() {
    div.transition()
        .duration(300)
        .style("opacity", 1e-6);
}

// Toggle children on click.
function click(d) {
    if (!d.reportsPopulated) {
        getReports(d, function (err, reports) {
            if (err) {
                throw err;
            }

            d.reportsPopulated = true;
            d.children = d.children || [];
            var childAlias = d.children && d.children[0] ? d.children[0].employee.Alias : null;
            reports.forEach(function (r) {
                if (childAlias != r.Alias) {
                    d.children.push(createNode(r));
                }

                d.children.sort();
            });

            update(d)
        });
    } else if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }

    update(d);
}

