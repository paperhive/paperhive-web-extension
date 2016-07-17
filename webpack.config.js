const ExtractTextPlugin = require('extract-text-webpack-plugin');

const extractHtml = new ExtractTextPlugin('[name].html');
const extractLess = new ExtractTextPlugin('[name].css');

module.exports = {
  entry: {
    background: './src/scripts/background.js',
    content: './src/scripts/content.js',
    popup: './src/scripts/popup.js',
  },
  output: {
    path: './build/',
    filename: '[name].js',
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'babel',
        query: { presets: ['es2015'] },
      },
      {
        test: /\.less$/,
        loader: extractLess.extract(['css', 'less']),
      },
      { test: /\.json$/, loader: 'json' },
      {
        test: /\.html$/,
        loader: extractHtml.extract('html-loader'),
      },
      // {
      //   test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
      //   loader: 'url-loader?limit=10000&minetype=application/font-woff',
      // },
      {
        test: /\.(svg|woff2)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
        loader: 'file',
      },
      // Toss all fonts except woff2. We're in Chrome/Firefox, so nothing else
      // is needed.
      {
        test: /\.(eot|ttf|woff)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
        loader: 'null-loader',
      },
    ],
  },
  plugins: [
    extractHtml,
    extractLess,
  ],
};
