'use strict';

(() => {
  const buffer = require('buffer');
  const co = require('co');
  const crypto = require('crypto');
  const config = require('../../config.json');

  const sources = require('paperhive-sources');

  // https://developer.chrome.com/extensions/events#filtered
  const urlFilter = [];
  sources.hostnames.forEach((hostname) => {
    urlFilter.push({ hostSuffix: hostname });
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

  const checkArticle = co.wrap(function* main(url, tabId) {
    const response = yield fetch(url);
    if (!response.ok) {
      throw Error('fetch unsuccessful');
    }
    setColorIcon(tabId);
    const json = yield response.json();
    // set tab data for communication with the popup script
    if (!(tabId in articleData)) {
      articleData[tabId] = {};
    }
    articleData[tabId].article = json;
    articleData[tabId].discussions = undefined;
    return json;
  });

  // The only difference with checkArticle is that the returned JSON object is
  // an array here.
  // Once we hace article revisions working in the backend, we expect to fetch
  // a meta article in all cases, so these two functions can be merged again.
  const checkArticleByDoi = co.wrap(function* main(url, tabId) {
    const response = yield fetch(url);
    if (!response.ok) {
      throw Error('fetch unsuccessful');
    }
    setColorIcon(tabId);
    const json = yield response.json();
    // set tab data for communication with the popup script
    if (!(tabId in articleData)) {
      articleData[tabId] = {};
    }
    articleData[tabId].article = json[0];
    articleData[tabId].discussions = undefined;
    return json[0];
  });

  const checkDiscussions = co.wrap(function* main(article, tabId) {
    if (!article || !article._id) {
      return;
    }
    // fetch discussions
    const url = config.apiUrl + '/articles/' + article._id + '/discussions/';
    const response = yield fetch(url);
    const discussions = yield response.json();
    // set icon
    if (discussions && discussions.length > 0) {
      // chrome.browserAction.setBadgeBackgroundColor([255, 0, 0, 255]);
      chrome.browserAction.setBadgeText({
        text: discussions.length < 1000 ?
          discussions.length.toString() : '999+',
        tabId: tabId,
      });
    }
    // set data
    articleData[tabId].discussions = discussions;
  });

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
    co.wrap(function* chain(details) {
      if (details.frameId !== 0) {
        // don't do anything if we're not in the main frame
        return;
      }
      const url = config.apiUrl + '/articles/sources?handle=' + details.url;
      const article = yield checkArticle(url, details.tabId);
      yield checkDiscussions(article, details.tabId);
      responseData(details.tabId);
    }),
    {
      url: urlFilter,
      types: ['main_frame'],
    }
  );

  // http://stackoverflow.com/a/33931307/353337
  const computeHash = co.wrap(function* main(url, hashType) {
    const response = yield fetch(url);
    const arrayBuffer = yield response.arrayBuffer();
    const buf = new Uint8Array(arrayBuffer);
    const hash = crypto.createHash(hashType);
    hash.update(buf, 'binary');
    return hash.digest('hex');
  });

  // TODO
  // Check <http://stackoverflow.com/a/27771671/353337> for a complete rundown
  // of how to detect if a page serves PDF content.
  //
  // Unfortunately, Chrome 42 doesn't properly fire
  // chrome.webRequest.onCompleted/main_frame when loading a PDF page. When
  // it's served from cache, it does. See
  // <https://code.google.com/p/chromium/issues/detail?id=481411>.
  chrome.webRequest.onCompleted.addListener(
    co.wrap(function* main(details) {
      if (details.frameId !== 0) {
        // don't do anything if we're not in the main frame
        return;
      }

      const header = extractHeader(details.responseHeaders, 'content-type');
      const mimetype = header && header.value.split(';', 1)[0];
      if (mimetype !== 'application/pdf') {
        return;
      }

      const hash = yield computeHash(details.url, 'sha1');

      // Since we have no access to the PDF data, we have to fetch it again
      // and hope it gets served from cache.
      // TODO come up with something smarter here
      const url = config.apiUrl + '/articles/bySha/' + hash;
      const article = yield checkArticle(url, details.tabId);
      yield checkDiscussions(article, details.tabId);
      responseData(details.tabId);
    }),
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
      if (!tabId) {
        console.error('Invalid tab ID.');
      }

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
    }
  );

  // DOI checker
  chrome.webNavigation.onCompleted.addListener(
    (details) => {
      if (details.frameId !== 0) {
        // don't do anything if we're not in the main frame
        return;
      }

      const searchDoiOnPaperhive = co.wrap(function* search(doi) {
        if (!doi) {return;}
        const url = config.apiUrl +
          '/articles/byDoi/' + encodeURIComponent(doi);
        const article = yield checkArticleByDoi(url, details.tabId);
        yield checkDiscussions(article, details.tabId);
        responseData(details.tabId);
      });

      // We would like to check the meta keys 'citation_doi' and
      // 'dc.identifier'. Since this needs parsing the actual HTML content, we
      // have to do it in the content script. Have that call back on
      // searchDoiOnPaperhive where we process the dois.
      if (articleData[details.tabId] && articleData[details.tabId].article) {
        // don't take action if we already have data
        return;
      }
      chrome.tabs.sendMessage(
        details.tabId,
        { keys: ['citation_doi', 'DC.Identifier'] },
        searchDoiOnPaperhive
      );
    },
    {
      types: ['main_frame'],
    }
  );
})();
