// Injected at document start on https://psekiewicz.github.io only (the origin
// allow-list is set where this file is registered, in MainActivity).
//
// Android's WebView is not Chrome: it ships no Web Share API and it ignores
// <a download> pointing at a blob: URL. Both of those are things the site
// actually uses — sharing a stats card is the one feature that would visibly
// break inside the app — so the shim below routes them to the host app, which
// has a real share sheet and real access to the Downloads folder. Everything
// here is additive: nothing is replaced when the platform already provides it.
(function () {
  'use strict';

  var host = window.ShowcaseHost;
  if (!host) return;

  var pending = Object.create(null);
  var nextId = 0;

  function call(action, payload) {
    return new Promise(function (resolve, reject) {
      var id = 'c' + ++nextId;
      pending[id] = { resolve: resolve, reject: reject };
      try {
        host.postMessage(JSON.stringify({ id: id, action: action, payload: payload || {} }));
      } catch (err) {
        delete pending[id];
        reject(err);
      }
    });
  }

  host.onmessage = function (event) {
    var reply;
    try {
      reply = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    var entry = pending[reply.id];
    if (!entry) return;
    delete pending[reply.id];
    if (reply.ok) {
      entry.resolve(reply.result);
    } else {
      var error = new Error(reply.error || 'The app could not complete that');
      // The site treats AbortError as "the user changed their mind" and stays
      // quiet about it, so the name has to survive the trip back.
      if (reply.name) error.name = reply.name;
      entry.reject(error);
    }
  };

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result);
        var comma = result.indexOf(',');
        resolve(comma === -1 ? '' : result.slice(comma + 1));
      };
      reader.onerror = function () {
        reject(reader.error || new Error('Could not read the file'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function define(target, name, value) {
    try {
      Object.defineProperty(target, name, { value: value, configurable: true, writable: true });
      return true;
    } catch (err) {
      try {
        target[name] = value;
        return target[name] === value;
      } catch (err2) {
        return false;
      }
    }
  }

  /* ---------- Web Share ---------- */

  if (typeof navigator.share !== 'function') {
    define(navigator, 'canShare', function (data) {
      if (!data) return false;
      if (data.files && data.files.length) {
        // One attachment is all ACTION_SEND carries here, and all the site sends.
        if (data.files.length !== 1) return false;
        return typeof Blob !== 'undefined' && data.files[0] instanceof Blob;
      }
      return Boolean(data.title || data.text || data.url);
    });

    define(navigator, 'share', function (data) {
      data = data || {};
      if (data.files && data.files.length) {
        var file = data.files[0];
        return toBase64(file).then(function (base64) {
          return call('shareFile', {
            name: file.name || 'showcase.png',
            mime: file.type || 'application/octet-stream',
            data: base64,
            title: data.title || '',
            text: data.text || '',
          });
        });
      }
      return call('shareText', {
        title: data.title || '',
        text: data.text || '',
        url: data.url ? new URL(data.url, location.href).href : '',
      });
    });
  }

  /* ---------- <a download> for blob:/data: URLs ---------- */

  var nativeClick = HTMLElement.prototype.click;
  define(HTMLAnchorElement.prototype, 'click', function () {
    var href = this.getAttribute('href') || '';
    if (this.hasAttribute('download') && /^(blob|data):/i.test(href)) {
      var name = this.getAttribute('download') || 'download';
      fetch(href)
        .then(function (response) {
          return response.blob();
        })
        .then(function (blob) {
          return toBase64(blob).then(function (base64) {
            return call('saveFile', {
              name: name,
              mime: blob.type || 'application/octet-stream',
              data: base64,
            });
          });
        })
        .catch(function () {
          // The host shows its own failure toast; nothing useful to add here.
        });
      return;
    }
    return nativeClick.apply(this, arguments);
  });

  /* ---------- Status bar tinting ---------- */

  // The system bars sit over a transparent window, so the app has to be told
  // what colour the page behind them currently is — including after someone
  // flips the in-page theme toggle.
  var lastReported = null;

  function reportTheme() {
    var body = document.body;
    if (!body) return;
    var background = getComputedStyle(body).backgroundColor;
    if (!background || background === 'rgba(0, 0, 0, 0)' || background === 'transparent') {
      background = getComputedStyle(document.documentElement).backgroundColor;
    }
    if (background === lastReported) return;
    lastReported = background;
    call('theme', { color: background }).catch(function () {});
  }

  function watch() {
    reportTheme();
    new MutationObserver(reportTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        // The stylesheet swap lands on the next frame, not on this callback.
        requestAnimationFrame(reportTheme);
      };
      if (query.addEventListener) query.addEventListener('change', onChange);
      else if (query.addListener) query.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch);
  } else {
    watch();
  }
})();
