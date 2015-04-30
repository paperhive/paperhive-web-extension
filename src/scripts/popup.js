'use strict';

var angular = require('angular');

var paperhive = angular
.module('paperHive', [])
.constant('config', require('../../config.json'));

paperhive.controller('PopupCtrl', [
  'config', '$scope',
  function(config, $scope) {
  var bg = chrome.extension.getBackgroundPage();
  $scope.frontendUrl = config.frontendUrl;
  $scope.article = {};
  chrome.tabs.query(
    {
      active: true,
      currentWindow: true
    },
    function(tabs) {
      // for some reason, we need $apply here
      $scope.$apply(function() {
        $scope.article.meta = bg.tabToArticle[tabs[0].id];
        $scope.article.discussions = bg.tabToDiscussions[tabs[0].id];
      });
    });
}]);
