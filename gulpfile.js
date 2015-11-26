'use strict';

const gulp = require('gulp');
const eslint = require('gulp-eslint');
const htmlhint = require('gulp-htmlhint');
const gutil = require('gulp-util');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const _ = require('lodash');
const streamify = require('gulp-streamify');
const htmlmin = require('gulp-htmlmin');
const minifyCSS = require('gulp-minify-css');
const imagemin = require('gulp-imagemin');
const pngquant = require('imagemin-pngquant');
const less = require('gulp-less');
const browserify = require('browserify');
const shim = require('browserify-shim');
const merge = require('merge-stream');
const zip = require('gulp-zip');

const debug = process.env.DEBUG || false;

const paths = {
  js: 'app/scripts/**.js',
  html: 'app/**.html',
};

// error handling, simplified version (without level) from
// http://www.artandlogic.com/blog/2014/05/error-handling-in-gulp/
function handleError(error) {
  gutil.log(error);
  process.exit(1);
}

// bundle js files + dependencies with browserify
// // (and continue to do so on updates)
// // see
// https://github.com/gulpjs/gulp/blob/master/docs/recipes/fast-browserify-builds-with-watchify.md
function js(watch, file) {
  const watchify = require('watchify');

  const browserifyArgs = _.extend(watchify.args, {debug: true});
  let bundler = browserify(
    './src/scripts/' + file,
    browserifyArgs
  );

  // use shims defined in package.json via 'browser' and 'browserify-shim'
  // properties
  bundler.transform(shim);

  // register watchify
  if (watch) {
    bundler = watchify(bundler);
  }

  function rebundle() {
    return bundler.bundle()
      .on('error', handleError)
      .pipe(source(file))
      .pipe(buffer())
      .pipe(gulp.dest('build/scripts/'));
  }
  bundler.on('update', rebundle);

  return rebundle();
}

gulp.task('scripts', ['eslint'], () => {
  const background = js(false, 'background.js');
  const popup = js(false, 'popup.js');
  const content = js(false, 'content.js');
  merge(background, popup, content);
});

const imageminOpts = {
  interlaced: true,  // gif
  multipass: true,  // svg
  progressive: true,  // jpg
  svgoPlugins: [{removeViewBox: false}],
  use: [pngquant()],
};

// copy static folders to build directory
gulp.task('static', () => {
  const locales = gulp.src('src/_locales/**')
  .pipe(gulp.dest('build/_locales'));

  const manifest = gulp.src('src/manifest.json')
  .pipe(gulp.dest('build'));

  const fontawesome = gulp.src('bower_components/fontawesome/fonts/*.woff2')
  .pipe(gulp.dest('build/fonts'));

  const roboto = gulp.src('bower_components/roboto-fontface/fonts/*.woff2')
    .pipe(gulp.dest('build/assets/roboto/fonts'));

  const images = gulp.src('src/images/*')
  .pipe(debug ? gutil.noop() : imagemin(imageminOpts))
  .pipe(gulp.dest('build/images'));

  return merge(locales, manifest, fontawesome, roboto, images);
});

gulp.task('eslint', () => {
  return gulp.src(['./src/scripts/*.js'])
  .pipe(eslint())
  .pipe(eslint.format())
  .pipe(eslint.failAfterError());
});

const htmlhintOpts = {
  'doctype-first': false,
};
gulp.task('htmlhint', () => {
  return gulp.src(paths.html)
  .pipe(htmlhint(htmlhintOpts))
  .pipe(htmlhint.reporter())
  .pipe(htmlhint.failReporter());
});

const htmlminOpts = {
  collapseWhitespace: true,
  removeComments: true,
};
// copy and compress HTML files
gulp.task('html', ['htmlhint'], () => {
  return gulp.src('src/*.html')
  .pipe(debug ? gutil.noop() : htmlmin(htmlminOpts))
  .pipe(gulp.dest('build'));
});

// compile less to css
gulp.task('styles', () => {
  const popup = gulp.src('src/styles/popup.less')
  .pipe(less())
  .on('error', handleError)
  .pipe(debug ? gutil.noop() : minifyCSS({
    restructuring: false,
  }))
  .pipe(gulp.dest('build'));
  const content = gulp.src('src/styles/content.less')
  .pipe(less())
  .on('error', handleError)
  .pipe(debug ? gutil.noop() : minifyCSS({
    restructuring: false,
  }))
  .pipe(gulp.dest('build'));

  return merge(popup, content);
});

gulp.task('clean', (cb) => {
  const del = require('del');
  del(['build/*'], cb);
  // del(['dist/*'], cb);
});

gulp.task(
  'zip',
  ['html', 'styles', 'static', 'scripts'], () => {
    // zip it all up
    const files = 'build/**';
    const zipName = 'paperhive.zip';
    gulp.src(files)
    .pipe(zip(zipName))
    .pipe(gulp.dest('.'));
  }
);

gulp.task('default', ['zip']);
