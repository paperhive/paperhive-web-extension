# Chrome extension for PaperHive

[![Build
Status](https://travis-ci.org/paperhive/paperhive-chrome-extension.svg?branch=master)](https://travis-ci.org/paperhive/paperhive-chrome-extension)
[![Dependency
Status](https://gemnasium.com/paperhive/paperhive-chrome-extension.svg)](https://gemnasium.com/paperhive/paperhive-chrome-extension)

##Build instructions
* Run `npm run install-deps` for installing all dependencies.
* Run `npm run build`. This will build the extension in `./build/`.
* Open Chrom{e,ium} on [chrome://extensions/](chrome://extensions/) and "Load unpacked extension" from
the`./build/` directory.
* Go to a page that has PaperHive discussions (e.g., https://arxiv.org/pdf/1208.0264.pdf) and see if it works for you.

##Distribution
* Make sure you bumped the version number in `package.json`,
  `src/manifest.json`, and `bower.json`.
* Make sure you are on the `master` branch.
* Build the extension
  ```
  npm run zip
  ```
  It will be zipped as `./paperhive.zip`.
* Create Git tag
  ```
  git tag v0.1.0
  git push --tags
  ```

### Chrome
* Go to [PaperHive's web store page](https://chrome.google.com/webstore/developer/edit/fihafdlllifbanclcjljledeifcdjbok)
  and upload a new package.

### Firefox
* Not quite ready yet.

## License
The PaperHive Chrome Extension is licensed under the
[GPL3](https://www.gnu.org/licenses/gpl.html) license.
