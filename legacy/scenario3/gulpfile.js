'use script';

var gulp = require('gulp');
var webserver = require('gulp-webserver');
var fs = require('fs');
var minimist = require('minimist');
var xmllint = require('xmllint');
var chalk = require('chalk');
var $ = require('gulp-load-plugins')({ lazy: true });
var del = require('del');
var runSequence = require('run-sequence');
var Xml2Js = require('xml2js');

var config = {
  release: './dist'
};

gulp.task('help', $.taskListing.withFilters(function (task) {
  var mainTasks = ['default', 'help', 'serve-static', 'validate', 'dist'];
  var isSubTask = mainTasks.indexOf(task) < 0;
  return isSubTask;
}));
gulp.task('default', ['help']);

/** +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+ **/

/**
 * Startup static webserver.
 */
gulp.task('serve-static', function () {
  gulp.src('.')
    .pipe(webserver({
      https: true,
      port: '8443',
      host: 'localhost',
      directoryListing: true,
      fallback: 'index.html'
    }));
});

/**
 * Validates the Office add-in for both catalog and store publishing
 */
gulp.task('validate', ['validate-forstore'], function() {
});

/**
 * Validates the Office add-in for submission to the Add-in catalog
 */
gulp.task('validate-forcatalog', ['validate-xml', 'validate-highResolutionIconUrl'], function() {
});

/**
 * Validates the Office add-in for submission to the Office Store
 */
gulp.task('validate-forstore', ['validate-xml', 'validate-highResolutionIconUrl'], function() {
  var options = minimist(process.argv.slice(2));
  var xmlFilePath = options.xmlfile;
  var xml = fs.readFileSync(xmlFilePath, 'utf-8');
  
  var parser = new Xml2Js.Parser();
  parser.parseString(xml, function(err, manifestJson) {
    // 5.7. Apps and add-ins must use SSL
    if (manifestJson.OfficeApp.DefaultSettings[0].SourceLocation[0].$.DefaultValue.indexOf('https://') !== 0) {
      console.log(chalk.red('ERROR: 5.7. Apps and add-ins must be secured with a valid ' + 
        'and trusted SSL certificate (HTTPS).'));
      console.log(chalk.blue('FIX: Change the URL of OfficeApp/DefaultSettings/SourceLocation/DefaultValue (' + 
        manifestJson.OfficeApp.DefaultSettings[0].SourceLocation[0].$.DefaultValue) + ') to https://');
    }
    
    // 5.10. icon must be present
    if (!manifestJson.OfficeApp.HighResolutionIconUrl ||
        manifestJson.OfficeApp.HighResolutionIconUrl.length === 0) {
      console.log(chalk.red('ERROR: 5.10. You must specify an icon for your app or add-in in your ' + 
        'add-in package or manifest'));
      console.log(chalk.blue('FIX: Add the HighResolutionIconUrl element to the manifest, eg. ' + 
        '<HighResolutionIconUrl DefaultValue="https://contoso.com/myicon.png" />'));
    }
    
    // 7.16. Support URL is required
    if (!manifestJson.OfficeApp.SupportUrl) {
      console.log(chalk.red('ERROR: 7.16. You must specify a valid Support URL in the SupportURL element ' + 
        'of your Office Add-in manifest.'));
      console.log(chalk.blue('FIX: Add the SupportUrl element to the manifest, eg. ' + 
        '<SupportUrl DefaultValue="http://contoso.com/support" />'));
    }
    
    // 10.9. Add-ins must use v1.1 of the schema
    if (manifestJson.OfficeApp.$.xmlns !== 'http://schemas.microsoft.com/office/appforoffice/1.1') {
      console.log(chalk.red('ERROR: 10.9. Office Add-ins must use version 1.1 of the Office.js library ' + 
        'and the manifest schema.'));
      console.log(chalk.blue('FIX: In the OfficeApp element change the value of the xlmns attribute to ' + 
        'http://schemas.microsoft.com/office/appforoffice/1.1'));
    }
  });
  
  var index = fs.readFileSync('index.html', 'utf-8').toLowerCase();
  
  // 7.15. Add-ins must use hosted Office.js file
  if (index.indexOf('//appsforoffice.microsoft.com/lib/1.1/hosted/office.js') < 0 &&
      index.indexOf('//appsforoffice.microsoft.com/lib/1/hosted/office.js') < 0) {
      console.log(chalk.red('ERROR: 7.15. All Office Add-ins must use the Microsoft-hosted Office.js file.'));
      console.log(chalk.blue('FIX: In the index.html change all references to office.js to ' + 
        'https://appsforoffice.microsoft.com/lib/1/hosted/office.js'));
  }
});

/**
 * Validates the Office add-in manifest against XSD
 */
gulp.task('validate-xml', function () {
  var options = minimist(process.argv.slice(2));
  var xsd = fs.readFileSync('./manifest.xsd');
  var xmlFilePath = options.xmlfile;
  var xml = fs.readFileSync(xmlFilePath);
  
  var result = xmllint.validateXML({
    xml: xml,
    schema: xsd
  });

  if (result.errors !== null) {
    console.log(chalk.red('Manifest XML invalid'));
    result.errors.forEach(function (e) {
      console.log(chalk.red(e));
    });
  }
});

/**
 * Validates the URL of the add-in icon
 */
gulp.task('validate-highResolutionIconUrl', function() {
  var options = minimist(process.argv.slice(2));
  var xmlFilePath = options.xmlfile;
  var xml = fs.readFileSync(xmlFilePath, 'utf-8');
  
  var parser = new Xml2Js.Parser();
  parser.parseString(xml, function(err, manifestJson) {
    if (manifestJson.OfficeApp.HighResolutionIconUrl &&
        manifestJson.OfficeApp.HighResolutionIconUrl.length > 0 &&
        manifestJson.OfficeApp.HighResolutionIconUrl[0].$ &&
        manifestJson.OfficeApp.HighResolutionIconUrl[0].$.DefaultValue) {
      var iconUrl = manifestJson.OfficeApp.HighResolutionIconUrl[0].$.DefaultValue; 
      if (iconUrl.indexOf('https://') < 0) {
        console.log(chalk.red('ERROR: The value of the HighResolutionIconUrl attribute contains an unsupported URL.' +
                ' You can only use https:// URLs.'));
      }
      
      if (!/^.+\.(png|jpg|jpeg)$/.test(iconUrl)) {
        console.log(chalk.red('ERROR: The URL of your app icon must end with one of the following extensions:' + 
                  ' png, jp(e)g'));
      }
    }
  });
});

/**
 * Removes existing dist folder
 */
gulp.task('dist-remove', function () {
  return del(config.release);
});

/**
 * Copies files to the dist folder
 */
gulp.task('dist-copy-files', function() {
  return gulp.src([
    './app*/**/*',
    './bower_components/**/*',
    './content/**/*',
    './images/**/*',
    './scripts/**/*',
    './manifest-*.xml',
    './index.html',
    './package.json'
  ], { base: './' }).pipe(gulp.dest(config.release));
});

/**
 * Optimizes JavaScript and CSS files
 */
gulp.task('dist-minify', ['dist-minify-js', 'dist-minify-css'], function() {
});

/**
 * Minifies and uglifies JavaScript files
 */
gulp.task('dist-minify-js', function() {
  gulp.src([
    './app*/**/*.js',
    './scripts/**/*', '!./scripts/MicrosoftAjax.js'
  ], { base: './' })
    .pipe($.uglify())
    .pipe(gulp.dest(config.release));
});

/**
 * Minifies and uglifies CSS files
 */
gulp.task('dist-minify-css', function() {
  gulp.src([
    './app*/**/*.css',
    './content/**/*.css'
  ], { base: './' })
    .pipe($.minifyCss())
    .pipe(gulp.dest(config.release));
});

/**
 * Creates a release version of the project
 */
gulp.task('dist', function () {
  runSequence(
    ['dist-remove'],
    ['dist-copy-files'],
    ['dist-minify']
    );
});