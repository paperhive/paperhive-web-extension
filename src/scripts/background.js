'use strict';

const buffer = require('buffer');
const co = require('co');
const crypto = require('crypto');
const _ = require('lodash');
const sources = require('paperhive-sources')();
const qs = require('qs');
const url = require('url');

const config = require('../../config.json');

const whitelistedHostnames =
  [
    'arxiv.org',
    'link.springer.com',
    'beta.paperhive.org',
    'paperhive.org',
  ];

/*
// https://developer.chrome.com/extensions/events#filtered
const urlFilter = [];
sources.hostnames.forEach((hostname) => {
  urlFilter.push({ hostSuffix: hostname });
});
*/

const documentData = {};
const pageUrls = {};
const responseSender = {};

const setColorIcon = (tabId) => {
  chrome.browserAction.setIcon({
    path: {
      19: 'images/icon-19.png',
      38: 'images/icon-38.png',
    },
    tabId,
  });
};

const setGrayIcon = (tabId) => {
  chrome.browserAction.setIcon({
    path: {
      19: 'images/icon-gray-19.png',
      38: 'images/icon-gray-38.png',
    },
    tabId,
  });
};

const setOaIcon = (tabId) => {
  chrome.browserAction.setIcon({
    path: {
      19: 'images/icon-oa-19.png',
      38: 'images/icon-oa-38.png',
    },
    tabId,
  });
};

function updateIcon(docData, tabId) {
  if (!docData) {
    return;
  }

  if (!docData.revisions[docData.indices.thisRevision].isOpenAccess &&
      docData.indices.newestOa > -1) {
    setOaIcon(tabId);
  } else {
    setColorIcon(tabId);
  }
}

function updateBadge(numDiscussions, tabId) {
  if (numDiscussions > 0) {
    // chrome.browserAction.setBadgeBackgroundColor([255, 0, 0, 255]);
    chrome.browserAction.setBadgeText({
      text: numDiscussions < 1000 ?
        numDiscussions.toString() : '999+',
      tabId,
    });
  }
}

const searchDocument = co.wrap(function* main(query) {
  // build query
  const q = _.clone(query);
  // Get only the most recent revision matching the query
  q.sortBy = '-publishedAt';
  q.limit = 1;
  const response = yield fetch(`${config.apiUrl}/documents?${qs.stringify(q)}`);
  if (!response.ok) {
    throw Error('document GET unsuccessful');
  }
  const res = yield response.json();

  let thisRevision;
  if (res.documents.length > 0) {
    thisRevision = res.documents[0];
  } else {
    // try to post
    const postResponse = yield fetch(
      `${config.apiUrl}/documents?${qs.stringify(query)}`,
      { method: 'POST' }
    );
    if (!postResponse.ok) {
      throw Error('document POST unsuccessful');
    }
    thisRevision = yield postResponse.json();
  }

  // Now get all revisions of the document; they come in chronological order
  const response2 = yield fetch(`${config.apiUrl}/documents/${thisRevision.id}/revisions/`);
  if (!response2.ok) {
    throw Error('document GET unsuccessful');
  }
  const all = yield response2.json();

  // set tab data for communication with the popup script
  return {
    revisions: all.revisions,
    // store a bunch of indices along with allRevisions
    indices: {
      thisRevision: _.findLastIndex(all.revisions, { revision: thisRevision.revision }),
      newestOa: _.findLastIndex(all.revisions, { isOpenAccess: true }),
    },
  };
});

const getDocument = co.wrap(function* main(documentId, revisionId) {
  // Get all revisions of the document; they come in chronological order
  const response = yield fetch(`${config.apiUrl}/documents/${documentId}/revisions/`);
  if (!response.ok) {
    throw Error('document GET unsuccessful');
  }
  const all = yield response.json();

  // On paperhive.org, only OA revisions are displayed.
  const search = { isOpenAccess: true };
  if (revisionId) {search.revision = revisionId;}

  const thisRevisionIdx = _.findLastIndex(all.revisions, search);

  // set tab data for communication with the popup script
  return {
    revisions: all.revisions,
    // store a bunch of indices along with allRevisions
    indices: {
      thisRevision: thisRevisionIdx,
      newestOa: thisRevisionIdx,
    },
  };
});

const getDiscussions = co.wrap(function* main(documentId) {
  if (!documentId) {
    return undefined;
  }
  // fetch discussions
  const discUrl = `${config.apiUrl}/documents/${documentId}/discussions/`;
  const response = yield fetch(discUrl);
  if (!response.ok) {
    throw Error('discussion GET unsuccessful');
  }
  const res = yield response.json();

  return res.discussions;
});

const responseData = (tabId) => (err) => {
  if (err) {
    console.error(err);
  }
  // If the user clicks on the extension icon before the data is loaded, the
  // data communication request is delayed until the data is available.  Namely
  // here! :)
  // Fulfill the promise and remove the sender afterwards.
  if (responseSender[tabId]) {
    // send the data
    responseSender[tabId](documentData[tabId]);
    // remove the dangling request
    responseSender[tabId] = undefined;
  }
};

/*
// from <http://stackoverflow.com/a/21042958/353337>
const extractHeader = (headers, headerName) => {
  for (let i = 0; i < headers.length; ++i) {
    const header = headers[i];
    if (header.name.toLowerCase() === headerName) {
      return header;
    }
  }
  return undefined;
};
*/

// // create data item
// chrome.tabs.onCreated.addListener(
//   function(tab) {
//     console.log('tabs.onCreated ' + tab.id);
//     documentData[tab.id] = {};
//   }
// );

// clean up after tab close
chrome.tabs.onRemoved.addListener(
  (tabId) => {
    documentData[tabId] = undefined;
    pageUrls[tabId] = [];
  }
);

// We could actually handle all this already at onBeforeNavigate, but Chrome
// appartently redraws the extension icons at that time, too. This way, the
// setColorIcon would sometimes have no effect. As a workaround, just draw a
// little bit later, namely at onCommitted.
chrome.webNavigation.onCommitted.addListener(
  co.wrap(function* chain(details) {
    const parsedUrl = url.parse(details.url);
    if (details.frameId !== 0) {
      // Don't do anything if we're not in the main frame.
      return;
    }

    if (documentData[details.tabId]) {
      // don't do anything if we already have document data for the tab
      return;
    }

    // This is done automatically by Chrome, but not by Firefox.
    setGrayIcon(details.tabId);

    if (whitelistedHostnames.indexOf(parsedUrl.hostname) === -1) {
      // Don't do anything if the hostname isn't whitelisted.
      return;
    }

    // First check if we're on PaperHive itself.
    let docData;
    if (['beta.paperhive.org', 'paperhive.org'].indexOf(parsedUrl.hostname) !== -1) {
      // Extract document id and revision id from URL.  This assumes a format
      // like
      //
      //   /documents/<documentId>
      //
      // or
      //
      //   /documents/<documentId>/revisions/<revisionId>
      //
      const pieces = parsedUrl.path.split('/');

      const docIdx = pieces.indexOf('documents');
      if (docIdx + 1 > pieces.length) {
        // invalid url
        return;
      }
      const documentId = pieces[docIdx + 1];

      const revisionIdx = pieces.indexOf('revisions');
      const revisionId = (revisionIdx + 1 <= pieces.length) ?
        pieces[revisionIdx + 1] :
        undefined;

      docData = yield getDocument(documentId, revisionId, details.tabId);
    } else {
      // Check if the URL indeed represents a valid remote.
      const remote = sources.parseUrl(details.url);
      if (!remote) {
        console.log(`${details.url} is no valid URL`);
        return;
      }
      docData = yield searchDocument({ url: details.url });
    }
    const documentId = docData.revisions[docData.indices.thisRevision].id;
    const disc = yield getDiscussions(documentId);
    documentData[details.tabId] = docData;
    documentData[details.tabId].discussions = disc;
    updateIcon(documentData[details.tabId], details.tabId);
    updateBadge(disc.length, details.tabId);
    responseData(details.tabId);
  })
  // Not supported in Firefox, cf.
  // <https://bugzilla.mozilla.org/show_bug.cgi?id=1242522>.
  // ,{
  //   url: urlFilter,
  //   types: ['main_frame'],
  // }
);

/*
// http://stackoverflow.com/a/33931307/353337
const computeHash = co.wrap(function* main(hashUrl, hashType) {
  const response = yield fetch(hashUrl);
  if (!response.ok) {
    throw Error('pdf GET unsuccessful');
  }
  const arrayBuffer = yield response.arrayBuffer();
  const buf = new Uint8Array(arrayBuffer);
  const hash = crypto.createHash(hashType);
  hash.update(buf, 'binary');
  return hash.digest('hex');
});
*/

/*
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
    const documentId = yield searchDocument({ pdfHash: hash });
    yield getDiscussions(documentId, details.tabId);
    responseData(details.tabId);
  }),
  {
    types: ['main_frame'],
  },
  ['responseHeaders']
);
*/

// DOI checker
chrome.webNavigation.onCompleted.addListener(
  (details) => {
    if (details.frameId !== 0) {
      // don't do anything if we're not in the main frame
      return;
    }
    if (documentData[details.tabId]) {
      // don't do anything if we already have document data for the tab
      return;
    }

    const searchDoiOnPaperhive = co.wrap(function* search(doi) {
      if (!doi) {return;}
      const docData = yield searchDocument({ doi });
      const documentId = docData.revisions[docData.indices.thisRevision].id;
      const disc = yield getDiscussions(documentId);
      documentData[details.tabId] = docData;
      documentData[details.tabId].discussions = disc;
      updateIcon(documentData[details.tabId], details.tabId);
      updateBadge(disc.length, details.tabId);
      responseData(details.tabId);
    });

    // We would like to check the meta keys 'citation_doi' and
    // 'dc.identifier'. Since this needs parsing the actual HTML content, we
    // have to do it in the content script. Have that call back on
    // searchDoiOnPaperhive where we process the dois.
    if (documentData[details.tabId] && documentData[details.tabId].revisions) {
      // don't take action if we already have data
      return;
    }
    chrome.tabs.sendMessage(
      details.tabId,
      { keys: ['citation_doi', 'DC.Identifier'] },
      searchDoiOnPaperhive
    );
  }
  // Not supported in Firefox, cf.
  // <https://bugzilla.mozilla.org/show_bug.cgi?id=1242522>.
  // ,{
  //   types: ['main_frame'],
  // }
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

    if (request.getDocumentData) {
      if (documentData[tabId]) {
        // send immediately since the tab is fully loaded
        sendResponse(documentData[tabId]);
      } else {
        // send later, cf.
        // <http://stackoverflow.com/a/30020271/353337>
        responseSender[tabId] = sendResponse;
        // returning `true` to indicate that we intend to send later, cf.
        // <https://developer.chrome.com/extensions/runtime#event-onMessage>
        return true;
      }
    }
    return undefined;
  }
);
