!function(n,e,t,r,i,o,a,c,f,s){for(var u=s,forceLoad=!1,p=0;p<document.scripts.length;p++)if(document.scripts[p].src.indexOf(o)>-1){u&&"no"===document.scripts[p].getAttribute("data-lazy")&&(u=!1);break}var _,d=!1,l=[],v=function(n){("e"in n||"p"in n||n.f&&n.f.indexOf("capture")>-1||n.f&&n.f.indexOf("showReportDialog")>-1)&&u&&m(l),v.data.push(n)};function h(){v({e:[].slice.call(arguments)})}function y(){if("boolean"==typeof _)return _;try{Symbol("x"),_=!0}catch(n){_=!1}return _}function E(n){v({p:"reason"in n?n.reason:"detail"in n&&"reason"in n.detail?n.detail.reason:n})}function m(o){if(!d){d=!0;var s=e.scripts[0],u=e.createElement("script");u.src=y()?a:c,u.crossOrigin="anonymous",u.addEventListener("load",(function(){try{n.removeEventListener(t,h),n.removeEventListener(r,E),n.SENTRY_SDK_SOURCE="loader";var e=n[i],a=e.init;e.init=function(n){var t=f;for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(t[r]=n[r]);!function(n,e){var t=n.integrations||[];if(!Array.isArray(t))return;var r=t.map((function(n){return n.name}));n.tracesSampleRate&&-1===r.indexOf("BrowserTracing")&&t.push(new e.BrowserTracing);y()&&(n.replaysSessionSampleRate||n.replaysOnErrorSampleRate)&&-1===r.indexOf("Replay")&&t.push(new e.Replay);n.integrations=t}(t,e),a(t)},function(e,t){try{for(var r=0;r<e.length;r++)"function"==typeof e[r]&&e[r]();var i=v.data,o=!(void 0===(u=n.__SENTRY__)||!u.hub||!u.hub.getClient());i.sort((function(n){return"init"===n.f?-1:0}));var a=!1;for(r=0;r<i.length;r++)if(i[r].f){a=!0;var c=i[r];!1===o&&"init"!==c.f&&t.init(),o=!0,t[c.f].apply(t,c.a)}!1===o&&!1===a&&t.init();var f=n.onerror,s=n.onunhandledrejection;for(r=0;r<i.length;r++)"e"in i[r]&&f?f.apply(n,i[r].e):"p"in i[r]&&s&&s.apply(n,[i[r].p])}catch(n){console.error(n)}var u}(o,e)}catch(n){console.error(n)}})),s.parentNode.insertBefore(u,s)}}v.data=[],n[i]=n[i]||{},n[i].onLoad=function(n){l.push(n),u&&!forceLoad||m(l)},n[i].forceLoad=function(){forceLoad=!0,u&&setTimeout((function(){m(l)}))},["init","addBreadcrumb","captureMessage","captureException","captureEvent","configureScope","withScope","showReportDialog"].forEach((function(e){n[i][e]=function(){v({f:e,a:arguments})}})),n.addEventListener(t,h),n.addEventListener(r,E),u||setTimeout((function(){m(l)}))}
(
  window,
  document,
  'error',
  'unhandledrejection',
  'Sentry',
  'loader.js',
  __LOADER_BUNDLE__,
  __LOADER_BUNDLE_ES5__,
  __LOADER_OPTIONS__,
  __LOADER_LAZY__
);
