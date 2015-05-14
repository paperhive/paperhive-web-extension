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

  var tabToArticle = {};
  var tabToDiscussions = {};
  var tabToMimeType = {};
  var responseSender = {};

  var handleResponses = function(err, tabId, article, discussions) {
    // send a response if so required
    if (responseSender[tabId]) {
      responseSender[tabId]({
        article: article,
        discussions: discussions
      });
      responseSender[tabId] = null;
    }
  };

  var fetchDiscussions = function(tabId, article, callback) {
    if (article) {
      tabToArticle[tabId] = article;
      // set icon
      chrome.pageAction.show(tabId);
      setColorIcon(tabId);

      if (article._id) {
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
            tabToDiscussions[tabId] = xhr.response;
            return callback(null, tabId, article, xhr.response);
          } else {
            return callback('Unexpected return value');
          }
        };
        xhr.send(null);
      }
    }
  };

  // Use webNavigation here since we use page actions. To `show` a page action,
  // one needs to be sure that the omnibox isn't updated anymore. This state is
  // not tracked by webRequest, see
  // <http://stackoverflow.com/a/30004730/353337>.
  chrome.webNavigation.onCommitted.addListener(
    function(details) {
      if (details.tabId >= 0) {
        tabToArticle[details.tabId] = undefined;
        tabToDiscussions[details.tabId] = undefined;
        async.waterfall(
          [
            function checkOnPaperHive(callback) {
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
          handleResponses
        );
      }
    },
    {
      urls: ['*://*/*'],
      types: ['main_frame']
    }
  );

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

  chrome.webRequest.onHeadersReceived.addListener(
    function(details) {
      if (!tabToArticle[details.tabId] && details.tabId >= 0) {
        var header = extractHeader(
          details.responseHeaders,
          'content-type'
        );
        // If the header is set, use its value. Otherwise, use undefined.
        tabToMimeType[details.tabId] =
          header && header.value.split(';', 1)[0];
      }
    },
    {
      urls: ['*://*/*.pdf'],
      types: ['main_frame']
    },
    ['responseHeaders']
  );

  // Chrome 42 doesn't properly fire chrome.webRequest.onCompleted/main_frame
  // when loading a PDF page. When it's served from cache, it does.
  // See <https://code.google.com/p/chromium/issues/detail?id=481411>.
  chrome.webRequest.onCompleted.addListener(
    function(details) {
      if (!tabToArticle[details.tabId] &&
          tabToMimeType[details.tabId] === 'application/pdf'
         ) {
        tabToDiscussions[details.tabId] = null;

        async.waterfall([
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
            xhr.open('GET', config.apiUrl + '/articles/bySha/' + hash, true);
            xhr.responseType = 'json';
            xhr.onload = function() {
              if (this.status === 200) {
                tabToArticle[details.tabId] = xhr.response;
                // Set the icon to color.
                // This might have already been done above, we need to do it
                // here to account for PDFs which are in our system but the
                // host which serves it is not actually approved. This happens,
                // for example, if someone copies an arXiv article to another
                // server.
                chrome.pageAction.show(details.tabId);
                setColorIcon(details.tabId);
                return callback(null, details.tabId, xhr.response);
              } else if (this.status === 404) {
                return callback('PDF not found on PaperHive');
              } else {
                return callback('Unexpected return value');
              }
            };
            xhr.send(null);
          },
          fetchDiscussions
        ],
        handleResponses
        );
      }
    },
    {
      urls: ['*://*/*.pdf'],
      types: ['main_frame']
    }
  );

  // add listener for content script communication
  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      if (request.getInfo) {
        // The tab ID is either in the sender (if a content script sent the
        // request) or in the request.activeTabId (if popup.js sent the
        // request).
        var tabId = request.activeTabId || sender.tab.id;
        if (!tabId) {
          console.error('Could not find tab ID.');
        }
        if (tabToArticle[tabId]) {
          // send immediately since the tab is fully loaded
          sendResponse({
            article: tabToArticle[tabId],
            discussions: tabToDiscussions[tabId]
          });
        } else {
          // send later, cf.
          // <http://stackoverflow.com/a/30020271/353337>
          responseSender[tabId] = sendResponse;
          // returning `true` to indicate that we intend to send later, cf.
          // <https://developer.chrome.com/extensions/runtime#event-onMessage>
          return true;
        }
      }
    }
  );
    if (responseSender[tabId]) {
      responseSender[tabId]({
        article: article,
        discussions: discussions
      });
      responseSender[tabId] = null;
    }
})();
