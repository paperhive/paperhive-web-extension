/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';
(function() {
  var crypto = require('crypto');
  var async = require('async');
  var config = require('../../config.json');

  var tabData = {};
  var responseSender = {};

  var handleResponse = function(err, tabId, article, discussions) {
    if (err) {
      console.error(err);
    }
    // set data
    tabData[tabId] = {
      article: article,
      discussions: discussions
    };
    // set icon
    if (article) {
      chrome.pageAction.show(tabId);
      setColorIcon(tabId);
    }
    // send a response if so required
    if (responseSender[tabId]) {
      responseSender[tabId](tabData[tabId]);
      responseSender[tabId] = null;
    }
  };

  var fetchDiscussions = function(tabId, article, callback) {
    if (!tabId) {
      return callback('Invalid tabId');
    }
    if (article && article._id) {
      // fetch discussions
      var xhr = new XMLHttpRequest();
      xhr.open(
        'GET',
        config.apiUrl + '/articles/' + article._id + '/discussions/',
        true
      );
      xhr.responseType = 'json';
      xhr.onload = function() {
        if (this.status === 200) {
          return callback(null, tabId, article, this.response);
        } else {
          return callback('Unexpected return value');
        }
      };
      xhr.send(null);
    } else {
      return callback(null, tabId, article);
    }
  };

  var isColor = {};
  var setColorIcon = function(tabId) {
    chrome.pageAction.setIcon({
      path: {
        '19': 'images/icon-19.png',
        '38': 'images/icon-38.png'
      },
      tabId: tabId
    });
    isColor[tabId] = true;
  };

  // from <http://stackoverflow.com/a/21042958/353337>
  var extractHeader = function(headers, headerName) {
    for (var i = 0; i < headers.length; ++i) {
      var header = headers[i];
      if (header.name.toLowerCase() === headerName) {
        return header;
      }
    }
  };

  // reset tabData
  chrome.tabs.onUpdated.addListener(
    function(tabId) {
      tabData[tabId] = undefined;
    }
  );

  // Use webNavigation here since we use page actions. To `show` a page action,
  // one needs to be sure that the omnibox isn't updated anymore. This state is
  // not tracked by webRequest, see
  // <http://stackoverflow.com/a/30004730/353337>.
  chrome.webNavigation.onCommitted.addListener(
    function(details) {
      if (!tabData[details.tabId]) {
        async.waterfall(
          [
            function getArticlebyUrl(callback) {
              // We could actually check on every single page, but we don't want
              // to put the PaperHive backend under too much load. Hence, filter
              // by hostname.
              // URL parsing in JS: <https://gist.github.com/jlong/2428561>
              var parser = document.createElement('a');
              parser.href = details.url;
              if (config.whitelistedHostnames.indexOf(parser.hostname) < 0) {
                return callback('Host not whitelisted', undefined);
              }

              var xhr = new XMLHttpRequest();
              xhr.open(
                'GET',
                config.apiUrl + '/articles/sources?handle=' + details.url,
                true
              );
              xhr.responseType = 'json';
              xhr.onload = function() {
                if (this.status === 200) {
                  return callback(null, details.tabId, this.response);
                } else {
                  return callback('Unexpected return value');
                }
              };
              xhr.send(null);
            },
            fetchDiscussions
          ],
          handleResponse
        );
      }
    },
    {
      urls: ['*://*/*'],
      types: ['main_frame']
    }
  );

  // Chrome 42 doesn't properly fire chrome.webRequest.onCompleted/main_frame
  // when loading a PDF page. When it's served from cache, it does.
  // See <https://code.google.com/p/chromium/issues/detail?id=481411>.
  chrome.webRequest.onCompleted.addListener(
    function(details) {
      if (!tabData[details.tabId]) {
        var header = extractHeader(details.responseHeaders, 'content-type');
        var mimetype = header && header.value.split(';', 1)[0];
        if (mimetype === 'application/pdf') {
          async.waterfall(
            [
              function getPdfHash(callback) {
                // Since we have no access to the PDF data, we have to
                // fetch it again and hope it gets served from cache.
                var xhr = new XMLHttpRequest();
                xhr.open('GET', details.url, true);
                xhr.responseType = 'blob';
                xhr.onload = function() {
                  if (this.status === 200) {
                    // read the blob data, cf.
                    // <http://www.html5rocks.com/en/tutorials/file/xhr2/>
                    var a = new FileReader();
                    a.readAsBinaryString(this.response);
                    a.onloadend = function() {
                      var hash = crypto.createHash('sha1');
                      hash.update(a.result, 'binary');
                      return callback(null, hash.digest('hex'));
                    };
                  } else {
                    return callback('Could not fetch PDF.');
                  }
                };
                xhr.send(null);
              },
              function checkBySha(hash, callback) {
                var xhr = new XMLHttpRequest();
                xhr.open(
                  'GET',
                  config.apiUrl + '/articles/bySha/' + hash,
                  true
                );
                xhr.responseType = 'json';
                xhr.onload = function() {
                  if (this.status === 200) {
                    return callback(null, details.tabId, this.response);
                  } else if (this.status === 404) {
                    return callback('PDF not found on PaperHive (404)');
                  } else {
                    return callback('Unexpected return value');
                  }
                };
                xhr.send(null);
              },
              fetchDiscussions
            ],
            handleResponse
          );
        }
      }
    },
    {
      urls: ['*://*/*.pdf'],
      types: ['main_frame']
    },
    ['responseHeaders']
  );

  // add listener for content script communication
  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      if (request.getInfo) {
        // The tab ID is either in the sender (if a content script sent the
        // request) or in the request.activeTabId (if popup.js sent the
        // request).
        var tabId = request.activeTabId || sender.tab.id;
        if (tabId) {
          if (tabData[tabId]) {
            // send immediately since the tab is fully loaded
            sendResponse(tabData[tabId]);
          } else {
            // send later, cf.
            // <http://stackoverflow.com/a/30020271/353337>
            responseSender[tabId] = sendResponse;
            // returning `true` to indicate that we intend to send later, cf.
            // <https://developer.chrome.com/extensions/runtime#event-onMessage>
            return true;
          }
        } else {
          console.error('Could not find tab ID.');
        }
      }
    }
  );
})();
