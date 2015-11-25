/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';

(() => {
  const crypto = require('crypto');
  const async = require('async');
  const config = require('../../config.json');
  const _ = require('lodash');

  const sources = require('paperhive-sources');
  // https://developer.chrome.com/extensions/events#filtered
  const urlFilter = [];
  sources.hostnames.forEach((hostname) => {
    urlFilter.push({hostSuffix: hostname});
  });

  const articleData = {};
  const pageUrls = {};
  const responseSender = {};

  const setColorIcon = (tabId) => {
    chrome.browserAction.setIcon({
      path: {
        '19': 'images/icon-19.png',
        '38': 'images/icon-38.png',
      },
      tabId: tabId,
    });
  };

  const checkArticle = (url, tabId) => {
    return function cb(callback) {
      fetch(url).then((response) => {
        if (response.ok) {
          setColorIcon(tabId);
          response.json().then((json) => {
            // set tab data for communication with the popup script
            if (!(tabId in articleData)) {
              articleData[tabId] = {};
            }
            // articleData[tabId].article = _.cloneDeep(json);
            articleData[tabId].article = json;
            return callback(null, json);
          });
        } else {
          return callback(null, null);
        }
      }).catch((err) => {
        console.error(err.message);
        return callback('Unexpected error when fetching ' + url);
      });
    };
  };

  // The only difference with checkArticle is that the returned JSON object is
  // an array here.
  // Once we hace article revisions working in the backend, we expect to fetch
  // a meta article in all cases, so these two functions can be merged again.
  const checkArticleByDoi = (url, tabId) => {
    return function cb(callback) {
      fetch(url).then((response) => {
        if (response.ok) {
          setColorIcon(tabId);
          response.json().then((json) => {
            // set tab data for communication with the popup script
            if (!(tabId in articleData)) {
              articleData[tabId] = {};
            }
            articleData[tabId].article = json[0];
            return callback(null, json);
          });
        } else {
          return callback(null, null);
        }
      }).catch((err) => {
        console.error(err.message);
        return callback('Unexpected error when fetching ' + url);
      });
    };
  };

  const checkDiscussions = (tabId) => {
    return function cb(article, callback) {
      if (article && article._id) {
        // fetch discussions
        const url = config.apiUrl +
          '/articles/' + article._id + '/discussions/';
        fetch(url).then((response) => {
          response.json().then((discussions) => {
            // set icon
            if (discussions && discussions.length > 0) {
              // chrome.browserAction.setBadgeBackgroundColor([255, 0, 0, 255]);
              let badge;
              if (discussions.length < 1000) {
                badge = discussions.length.toString();
              } else {
                badge = '999+';
              }
              chrome.browserAction.setBadgeText({
                text: badge,
                tabId: tabId,
              });
            }
            // set data
            articleData[tabId].discussions = discussions;
            return callback(null, discussions);
          });
        }).catch((err) => {
          console.error(err.message);
          return callback('Unexpected error when fetching ' + url);
        });
      } else {
        return callback(null);
      }
    };
  };

  const responseData = (tabId) => {
    return function cb(err) {
      if (err) {
        console.error(err);
      }
      // If the user clicks on the extension icon before the data is loaded,
      // the data communication request is delayed until the data is available.
      // Namely here! :)
      // Fulfill the promise and remove the sender afterwards.
      if (responseSender[tabId]) {
        // send the data
        responseSender[tabId](articleData[tabId]);
        // remove the dangling request
        responseSender[tabId] = null;
      }
    };
  };

  // from <http://stackoverflow.com/a/21042958/353337>
  const extractHeader = (headers, headerName) => {
    for (let i = 0; i < headers.length; ++i) {
      const header = headers[i];
      if (header.name.toLowerCase() === headerName) {
        return header;
      }
    }
  };

  // // create data item
  // chrome.tabs.onCreated.addListener(
  //   function(tab) {
  //     console.log('tabs.onCreated ' + tab.id);
  //     articleData[tab.id] = {};
  //   }
  // );

  // clean up after tab close
  chrome.tabs.onRemoved.addListener(
    (tabId) => {
      articleData[tabId] = undefined;
      pageUrls[tabId] = [];
    }
  );

  // We could actually handle all this already at onBeforeNavigate, but Chrome
  // appartently redraws the extension icons at that time, too. This way, the
  // setColorIcon would sometimes have no effect. As a workaround, just draw a
  // little bit later, namely at onCommitted.
  chrome.webNavigation.onCommitted.addListener(
    (details) => {
      if (details.frameId !== 0) {
        // don't do anything if we're not in the main frame
        return;
      }
      const url = config.apiUrl + '/articles/sources?handle=' + details.url;
      async.waterfall(
        [
          checkArticle(url, details.tabId),
          checkDiscussions(details.tabId),
        ],
        responseData(details.tabId)
      );
    },
    {
      url: urlFilter,
      types: ['main_frame'],
    }
  );

  const computeHash = (url, hashType) => {
    return function cb(callback) {
      fetch(url).then((response) => {
        return response.blob();
      }).then((data) => {
        // read the blob data, cf.
        // <https://developer.mozilla.org/en/docs/Web/API/FileReader>
        const a = new FileReader();
        a.readAsBinaryString(data);
        a.onloadend = () => {
          const hash = crypto.createHash(hashType);
          hash.update(a.result, 'binary');
          return callback(null, hash.digest('hex'));
        };
      }).catch((err) => {
        console.error(err.message);
        return callback(
          'Unexpected error when fetching ' + url
        );
      });
    };
  };

  // TODO
  // Check <http://stackoverflow.com/a/27771671/353337> for a complete rundown
  // of how to detect if a page serves PDF content.
  //
  // Unfortunately, Chrome 42 doesn't properly fire
  // chrome.webRequest.onCompleted/main_frame when loading a PDF page. When
  // it's served from cache, it does. See
  // <https://code.google.com/p/chromium/issues/detail?id=481411>.
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (details.frameId !== 0) {
        // don't do anything if we're not in the main frame
        return;
      }

      const header = extractHeader(details.responseHeaders, 'content-type');
      const mimetype = header && header.value.split(';', 1)[0];
      if (mimetype !== 'application/pdf') {
        return;
      }

      async.waterfall(
        [
          // Since we have no access to the PDF data, we have to fetch it again
          // and hope it gets served from cache.
          // TODO come up with something smarter here
          computeHash(details.url, 'sha1'),
          function checkArticleBySha(hash, callback) {
            const url = config.apiUrl + '/articles/bySha/' + hash;
            return checkArticle(url, details.tabId)(callback);
          },
          checkDiscussions(details.tabId),
        ],
        responseData(details.tabId)
        );
    },
    {
      urls: ['*://*/*'],
      types: ['main_frame'],
    },
    ['responseHeaders']
  );

  // add listener for content script communication
  chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
      // The tab ID is either in the sender (if a content script sent the
      // request) or in the request.activeTabId (if popup.js sent the request).
      const tabId = request.activeTabId || sender.tab.id;
      if (tabId) {
        if (request.getArticleData) {
          if (articleData[tabId].article) {
            // send immediately since the tab is fully loaded
            sendResponse(articleData[tabId]);
          } else {
            // send later, cf.
            // <http://stackoverflow.com/a/30020271/353337>
            responseSender[tabId] = sendResponse;
            // returning `true` to indicate that we intend to send later, cf.
            // <https://developer.chrome.com/extensions/runtime#event-onMessage>
            return true;
          }
        }
      } else {
        console.error('Invalid tab ID.');
      }
    }
  );

  // DOI checker
  chrome.webNavigation.onCompleted.addListener(
    (details) => {
      if (details.frameId !== 0) {
        // don't do anything if we're not in the main frame
        return;
      }

      const searchDoiOnPaperhive = (doi) => {
        if (!doi) {return;}
        const url = config.apiUrl +
          '/articles/byDoi/' + encodeURIComponent(doi);
        async.waterfall(
          [
            checkArticleByDoi(url, details.tabId),
            checkDiscussions(details.tabId),
          ],
          responseData(details.tabId)
        );
      };

      // We would like to check the meta keys 'citation_doi' and
      // 'dc.identifier'. Since this needs parsing the actual HTML content, we
      // have to do it in the content script. Have that call back on
      // searchDoiOnPaperhive where we process the dois.
      if (articleData[details.tabId].article) {
        // don't take action if we already have data
        return;
      }
      chrome.tabs.sendMessage(
        details.tabId,
        {keys: ['citation_doi', 'DC.Identifier']},
        searchDoiOnPaperhive
      );
    },
    {
      types: ['main_frame'],
    }
  );
})();
