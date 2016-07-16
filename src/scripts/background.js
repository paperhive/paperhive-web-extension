'use strict';

// TODO: get rid of the polyfill
// required by mutx
require('babel-polyfill');

const buffer = require('buffer');
const co = require('co');
const crypto = require('crypto');
const _ = require('lodash');
const mutx = require('mutx');
const sources = require('paperhive-sources')();
const qs = require('qs');
const urlParse = require('url').parse;

const config = require('../../config.json');

const whitelistedHostnames = [
  /arxiv\.org$/,
  /^oapen.org/,
  /^link\.springer\.com$/,
  /paperhive\.org$/,
  /sciencedirect\.com$/,
];

function getShortNumber(number) {
  if (number < 1e3) return number.toString();
  if (number < 1e6) return `${Math.floor(number / 1e3)}K`;
  if (number < 1e9) return `${Math.floor(number / 1e6)}M`;
  return '>1e9';
}

const getDocumentByRemote = co.wrap(function* getDocumentByRemote(type, id) {
  const remote = { type, id };
  const response =
    yield fetch(`${config.apiUrl}/documents/remote?${qs.stringify(remote)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Unsuccessful request: ${response.statusText}`);
  return yield response.json();
});

const getDocumentRevisions = co.wrap(function* getDocumentRevisions(docId) {
  const response = yield fetch(`${config.apiUrl}/documents/${docId}/revisions/`);
  if (!response.ok) throw new Error('revisions GET unsuccessful');
  const body = yield response.json();
  return body.revisions;
});

const getDiscussions = co.wrap(function* getDiscussions(documentId) {
  // fetch discussions
  const response =
    yield fetch(`${config.apiUrl}/documents/${documentId}/discussions/`);
  if (!response.ok) throw new Error('discussion GET unsuccessful');
  const body = yield response.json();
  return body.discussions;
});

// ****************************************************************************
// Tab class represents the state of a tab
class Tab {
  constructor(tabId) {
    this.tabId = tabId;
  }

  _updateIcon(color) {
    const prefix = `images/icon-${color ? '' : 'gray-'}`;
    chrome.browserAction.setIcon({
      path: { 19: `${prefix}19.png`, 38: `${prefix}38.png` },
      tabId: this.tabId,
    });
  }

  _updateBadge(number) {
    chrome.browserAction.setBadgeText({
      text: number ? getShortNumber(number) : '',
      tabId: this.tabId,
    });
  }

  _reset() {
    this._updateIcon();
    this._updateBadge();
    delete this.revisions;
    delete this.discussions;
  }

  _updateDocument(docId) {
    const self = this;
    return co(function* _updateDocument() {
      // TODO: remove?
      // silently stop processing if no document is given
      // (actual errors are thrown)
      // if (!doc) return;

      // get all revisions and discussions
      const [revisions, discussions] =
        yield [getDocumentRevisions(docId), yield getDiscussions(docId)];

      // save data
      self.revisions = revisions;
      self.discussions = discussions;

      // update icon+badge
      self._updateIcon(true);
      self._updateBadge(discussions.length);

      // TODO: do we need this?
      // notify tab
      // responseData(tabId);
    });
  }

  onUrlChange(url) {
    const self = this;
    return co(function* _onUrlChange() {
      self._reset();

      if (!url) return;

      // parse the tab url
      const parsedUrl = urlParse(url);

      // Don't do anything if the hostname isn't whitelisted.
      if (!_.some(whitelistedHostnames, re => re.test(parsedUrl.hostname))) return;

      if (/paperhive\.org$/.test(parsedUrl.hostname)) {
        // we're on PaperHive itself; Extract document id and revision id from URL.
        // This assumes a path of the form /documents/<documentId>*
        const matches = /\/documents\/([^\/]+)(?:[\/?].*)?$/
          .exec(parsedUrl.path);
        if (matches) {
          yield self._updateDocument(matches[1]);
          return;
        }
      } else {
        // let the PaperHive API determine if this URL resolves to a document
        // on PaperHive
        const doc = yield getDocumentByRemote('url', url);
        if (doc) {
          yield self._updateDocument(doc.id);
          return;
        }
      }

      // TODO: add other checks (e.g., doi extraction)
    });
  }
}

// ****************************************************************************
// state variables

// tabs maps tabIds to Tab instances
const tabs = {};

// tabMutexes maps tabIds to mutexes for guaranteed mutual exclusive access
const tabMutexes = {};

// ****************************************************************************
// in-tab event handlers
// note: event handlers must take care of locking/unlocking

const safeCall = co.wrap(function* safeCall(tabId, methodName, ...args) {
  console.log(tabId, methodName, ...args);
  const unlock = yield tabMutexes[tabId].lock();
  try {
    yield tabs[tabId][methodName].apply(tabs[tabId], args);
  } catch (error) {
    console.error(error);
  }
  unlock();
});

// TODO: use event filters when firefox supports them
// Not supported in Firefox, cf.
// <https://bugzilla.mozilla.org/show_bug.cgi?id=1242522>.
// ,{
//   url: urlFilter,
//   types: ['main_frame'],
// }

// We could actually handle this already at onBeforeNavigate, but Chrome
// appartently redraws the extension icons at that time, too. This way,
// setIcon() would sometimes have no effect. As a workaround, just run this a
// little bit later, namely at onCommitted.
function onUrlChange(details) {
  console.log('onUrlChange', details.tabId, details.url);
  // Don't do anything if we're not in the main frame or if the tab has not
  // been set up
  if (details.frameId !== 0 || !tabs[details.tabId]) return;

  safeCall(details.tabId, 'onUrlChange', details.url);
}
chrome.webNavigation.onCommitted.addListener(onUrlChange);
chrome.webNavigation.onHistoryStateUpdated.addListener(onUrlChange);


// ****************************************************************************
// tab event handlers
function setupTab(tabId) {
  // set up tab only once
  if (tabs[tabId]) return;

  tabs[tabId] = new Tab(tabId);
  tabMutexes[tabId] = new mutx.Mutex();

  // kick off url change
  chrome.tabs.get(tabId, tab => safeCall(tabId, 'onUrlChange', tab.url));
}

function removeTab(tabId) {
  // tab may not be set up
  if (!tabs[tabId]) return;

  // make sure we do not interfere with a running operation
  tabMutexes[tabId].lock().then(unlock => {
    delete tabs[tabId];
    delete tabMutexes[tabId];
    unlock();
  });
}

// setup Tab instance when tab is activated
chrome.tabs.onActivated.addListener(active => setupTab(active.tabId));

// setup Tab instance for existing active tabs
chrome.tabs.query(
  { active: true },
  _tabs => _tabs.forEach(tab => setupTab(tab.id))
);

chrome.tabs.onReplaced.addListener((addedTab, removedTag) => {
  console.log('replace', addedTab, removedTag);
});

// clean up after tab close (wait until all pending actions completed)
chrome.tabs.onRemoved.addListener(tabId => removeTab(tabId));

/*
const searchDocument = co.wrap(function* main(query) {
  // build query
  const q = _.clone(query);
  // Get only the most recent revision matching the query
  q.sortBy = '-publishedAt';
  q.limit = 1;
  const response = yield fetch(`${config.apiUrl}/documents/search?${qs.stringify(q)}`);
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
      latestOa: _.findLastIndex(all.revisions, { isOpenAccess: true }),
    },
  };
});
*/

/*
const responseSender = {};

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
    responseSender[tabId](tabs[tabId]);
    // remove the dangling request
    delete responseSender[tabId];
  }
};

// scan document content for remotes
// TODO: send generic 'scanRemote' message (instead of DOI request)
chrome.webNavigation.onCompleted.addListener(details => {
  // don't do anything if we're not in the main frame
  if (details.frameId !== 0) return;

  // don't do anything if we already have document data for the tab
  if (tabs[details.tabId]) return;

  chrome.tabs.sendMessage(
    details.tabId,
    { keys: ['citation_doi', 'DC.Identifier'] },
    co.wrap(function* scanRemoteResponse(doi) {
      if (!doi) return;
      const revision = yield getDocumentByRemote('doi', doi);
      setRevision(details.tabId, revision);
    })
  );
});
// Not supported in Firefox, cf.
// <https://bugzilla.mozilla.org/show_bug.cgi?id=1242522>.
// ,{
//   types: ['main_frame'],
// }

// add listener for content+popup script communication
chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    // The tab ID is either in the sender (if a content script sent the
    // request) or in the request.activeTabId (if popup.js sent the request).
    const tabId = request.activeTabId || sender.tab.id;
    if (!tabId) throw new Error('Invalid tab ID.');

    if (request.gettabs) {
      if (tabs[tabId]) {
        // send immediately since the tab is fully loaded
        sendResponse(tabs[tabId]);
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
*/
