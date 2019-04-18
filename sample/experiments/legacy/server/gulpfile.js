var gulp = require("gulp");
var browserify = require("browserify");
var source = require("vinyl-source-stream");
var tsify = require("tsify");
var less = require("gulp-less");
var plumber = require('gulp-plumber');
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json", { typescript: require('typescript') });
var clean = require("gulp-clean");
var tslint = require("gulp-tslint");
var sourcemaps = require('gulp-sourcemaps');
var path = require('path');

// Cleans up generated files
gulp.task("clean", function() {
    return gulp.src(['dist', 'public/dist'], { read: false })        
        .pipe(clean());
})

// Compile from less to css files
gulp.task("less", function () {
  return gulp.src('public/stylesheets/**/*.less')
    .pipe(less())
    .pipe(gulp.dest('./public/stylesheets/'));
});

// Builds the server side JavaScript
gulp.task("build", function () {
    var errors = false;

    return gulp.src(['src/**/*.ts'])
        .pipe(plumber(function() { errors = true; } ))      
        .pipe(sourcemaps.init())
        .pipe(ts(tsProject))
        .js
        .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: function(file) {                         
            return path.join(file.cwd, './src'); 
        } }))    
        .pipe(gulp.dest("dist"))
        .on('end', function() {
            if (errors) {
                console.error("Build failed");
                process.exit(1);
            } 
        })
});

// Linting to validate style guide
gulp.task("tslint", () =>
    gulp.src(['src/**/*.ts'])
        .pipe(tslint({
            formatter: "verbose"
        }))
        .pipe(tslint.report())
);

// Browserified client code definitions
let controllers = [
    { name: "browserify", src: "src/ng/main.ts", outFile: "main.js", folder: "public/dist/ng", standalone: "controller" },
    { name: "api", src: "src/api/index.ts", outFile: "api.js", folder: "public/dist/api", standalone: "pronet" },
    { name: "calendar", src: "src/calendar/driver.ts", outFile: "driver.js", folder: "public/dist/views/calendar", standalone: "calendar" },
    { name: "canvas", src: "src/canvas/index.ts", outFile: "canvas.js", folder: "public/dist/canvas", standalone: "canvas" },
];

// Generate tasks for the browserified code
for (let controller of controllers) {
    gulp.task(controller.name, function() {
        return browserify({
                basedir: '.',
                debug: true,
                entries: controller.src,
                cache: {},
                packageCache: {},
                standalone: controller.standalone,
            })        
            .plugin(tsify)        
            .bundle()        
            .pipe(source(controller.outFile))
            .pipe(gulp.dest(controller.folder))
    });
}

let browserifyTasks = controllers.map(function(controller) { return controller.name });

gulp.task("default", ["less", "tslint", "build"].concat(browserifyTasks));
