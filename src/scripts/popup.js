'use strict';

var angular = require('angular');

var paperhive = angular.module('paperHive', []);

paperhive.controller('PopupCtrl', ['$scope', function($scope) {
  $scope.test = '123';
}]);

var bg = chrome.extension.getBackgroundPage();

chrome.tabs.query(
  {
    active: true,
    currentWindow: true
  },
  function(tabs) {
  // fetch meta info from active tab
  var article = bg.tabToArticle[tabs[0].id];

  document.getElementById('title').textContent = article.title;
  document.getElementById('authors').textContent = article.authors.join(', ');
  document.getElementById('link').href =
    'https://paperhive.org/dev/frontend/branches/master/#/articles/' +
    article._id;
});
