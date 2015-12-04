'use strict';

(() => {
  const angular = require('angular');

  const paperhive = angular
  .module('paperHive', [])
  .constant('config', require('../../config.json'));

  paperhive.controller('PopupCtrl', [
    'config', '$http', '$scope',
    (config, $http, $scope) => {
      $scope.frontendUrl = config.frontendUrl;
      $scope.article = {};

      $scope.submitApproved = (url) => {
        if (url) {
          $scope.submitting = true;
          $http.post(config.apiUrl + '/articles/sources', undefined, {
            params: { xhandle: url },
          })
          .success((article) => {
            $scope.submitting = false;
            chrome.tabs.create({
              url: config.frontendUrl + '/articles/' + article._id,
            });
          })
          .error((data) => {
            $scope.submitting = false;
            let message;
            if (data && data.message) {
              message = data.message;
            } else {
              message = 'could not add article (unknown reason)';
            }
            // notificationService.notifications.push({
            //   type: 'error',
            //   message: message
            // });
          });
        }
      };

      // fetch data from the background script
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true,
        },
        (tabs) => {
          // expose tab url to popup.html
          // We need $apply here, see, e.g.,
          // <http://jimhoskins.com/2012/12/17/angularjs-and-apply.html>.
          $scope.$apply(() => {
            $scope.tabUrl = tabs[0].url;
          });
          // get article data
          chrome.runtime.sendMessage(
            {
              getArticleData: true,
              activeTabId: tabs[0].id,
            },
            (response) => {
              // same as above
              $scope.$apply(() => {
                $scope.article.meta = response.article;
                $scope.article.discussions = response.discussions;
              });
            }
          );
        }
      );
    }]);
})();
