// needed for assignment to $scope:
/* eslint no-param-reassign: 0 */
'use strict';

// for webpack
require('../popup.html');
require('../styles/popup.less');

const angular = require('angular');

const paperhive = angular
.module('paperHive', [])
.constant('config', require('../../config.json'));

paperhive.controller('PopupCtrl', [
  'config', '$http', '$scope',
  (config, $http, $scope) => {
    $scope.frontendUrl = config.frontendUrl;
    $scope.document = {};

    $scope.submitApproved = (url) => {
      if (url) {
        $scope.submitting = true;
        $http.post(`${config.apiUrl}/documents/url/`, undefined, {
          q: { xhandle: url },
        })
        .success((document) => {
          $scope.submitting = false;
          chrome.tabs.create({
            url: `${config.frontendUrl}/documents/${document.id}`,
          });
        })
        .error((data) => {
          $scope.submitting = false;
          let message;
          if (data && data.message) {
            message = data.message;
          } else {
            message = 'could not add document (unknown reason)';
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
        // get document data
        chrome.runtime.sendMessage(
          {
            getDocumentData: true,
            activeTabId: tabs[0].id,
          },
          (response) => {
            // same as above
            $scope.$apply(() => {
              $scope.document = response;
            });
          }
        );
      }
    );
  },
]);
