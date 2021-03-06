# Browser extension for PaperHive

[![Build
Status](https://travis-ci.org/paperhive/paperhive-web-extension.svg?branch=master)](https://travis-ci.org/paperhive/paperhive-chrome-extension)
[![Dependency
Status](https://gemnasium.com/paperhive/paperhive-web-extension.svg)](https://gemnasium.com/paperhive/paperhive-web-extension)

The PaperHive browser extension informs you about dicussions on articles while you are browsing. This is how it looks like:

<a href="https://cloud.githubusercontent.com/assets/1874116/16908275/75d01d84-4cca-11e6-80ca-f209871a0eee.png" title="PaperHive Chrome extension on arXiv"><img src="https://cloud.githubusercontent.com/assets/1874116/16908275/75d01d84-4cca-11e6-80ca-f209871a0eee.png" width="500"></a>

In order to protect your privacy, the extension is only active on whitelisted pages (search for *whitelist* in the [source](https://github.com/paperhive/paperhive-web-extension/blob/master/src/scripts/background.js)).

The extension can be installed for both

 * [Chrome/Chromium](https://chrome.google.com/webstore/detail/paperhive/fihafdlllifbanclcjljledeifcdjbok) and
 * [Firefox](https://addons.mozilla.org/en-US/firefox/addon/paperhive/).

##Build instructions
* Copy `config.json.default` to `config.json` and adapt to your needs.
* Run `npm run install-deps` for installing all dependencies.
* Run `npm run build:chrome`. This will build the extension in `./build/`.
* Open Chrom{e,ium} on [chrome://extensions/](chrome://extensions/) and "Load unpacked extension" from
the`./build/` directory.
* Go to a page that has PaperHive discussions (e.g., https://arxiv.org/abs/1603.04246) and see if it works for you.

For development, use
```
npm run watch
```
to enable live rebuild of the extension.

##Distribution
* Make sure you bumped the version number in
  - `package.json`,
  - `src/manifest.json.chrome`,
  - `src/manifest.json.firefox`, and
  - `bower.json`.
* Make sure you are on the `master` branch.
* Create Git tag
  ```
  git tag v0.1.0
  git push --tags
  ```

### Chrome
* Build the extension for Chrome,
  ```
  npm run zip
  ```
  and upload `./paperhive.zip` to [PaperHive's web store page](https://chrome.google.com/webstore/developer/edit/fihafdlllifbanclcjljledeifcdjbok).

### Firefox
* Build the extension for Firefox,
  ```
  npm run xpi
  ```
  and upload `./paperhive.xpi` to [PaperHive's Mozilla add-on page](https://addons.mozilla.org/en-US/developers/addon/paperhive/versions).

## License
The PaperHive Chrome Extension is licensed under the
[GPL3](https://www.gnu.org/licenses/gpl.html) license.
