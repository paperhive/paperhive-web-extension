'use strict';

(function() {

  console.log(123);

  var elemDiv = document.createElement('div');
  elemDiv.style.cssText = 'position:absolute;width:20px;height:20px;opacity:0.3;z-index:100;background:#000;';
  document.body.appendChild(elemDiv);

})();
