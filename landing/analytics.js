/*
 * Google Analytics 4 for scambiofavori.it, loaded ONLY after the visitor accepts.
 *
 * - While GA_ID is the placeholder below, the script does nothing: no banner, no requests.
 * - Nothing from Google is loaded before consent. The choice is kept in localStorage
 *   (a technical item, not a tracking cookie) and can be changed from "Preferenze cookie".
 * - Rejecting is as easy as accepting. Default consent state is "denied" (Consent Mode v2).
 */
(function () {
  'use strict';

  var GA_ID = 'G-CTHZYGWGJL'; // measurement id of the "Scambio di Favori sito" web stream
  var STORAGE_KEY = 'sf_cookie_consent_v1';
  var PLACEHOLDER = 'G-XXXXXXXXXX';
  var VALID_ID = /^G-[A-Z0-9]{6,}$/;

  if (GA_ID === PLACEHOLDER || !VALID_ID.test(GA_ID)) return;

  function readChoice() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw).choice : null;
    } catch (e) {
      return null;
    }
  }

  function saveChoice(choice) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ choice: choice, at: new Date().toISOString() })
      );
    } catch (e) { /* storage blocked: the banner will simply ask again */ }
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });

  var loaded = false;
  function loadAnalytics() {
    if (loaded) return;
    loaded = true;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  }

  function clearAnalyticsCookies() {
    var host = window.location.hostname;
    var domains = [host, '.' + host, '.' + host.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name === '_ga' || name.indexOf('_ga_') === 0 || name === '_gid') {
        domains.forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d;
        });
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      }
    });
  }

  var STYLE =
    '#sf-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:640px;margin:0 auto;' +
    'background:#1A2E22;color:#E8F1EA;border:1px solid #2A4A35;border-radius:16px;padding:18px 20px;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.45);font:15px/1.5 "DM Sans",system-ui,sans-serif}' +
    '#sf-consent h2{margin:0 0 6px;font-size:17px;font-weight:800;letter-spacing:-.01em;color:#fff;border:0;padding:0}' +
    '#sf-consent p{margin:0 0 14px;color:#C4DACB}' +
    '#sf-consent a{color:#F87828}' +
    '#sf-consent .sf-row{display:flex;gap:10px;flex-wrap:wrap}' +
    '#sf-consent button{flex:1 1 140px;min-height:44px;border-radius:12px;font:700 15px "DM Sans",system-ui,sans-serif;' +
    'cursor:pointer;border:2px solid #B8C868;background:transparent;color:#B8C868}' +
    '#sf-consent button.sf-accept{background:#F87828;border-color:#F87828;color:#0F1A14}' +
    '#sf-consent button:focus-visible{outline:3px solid #fff;outline-offset:2px}';

  function removeBanner() {
    var el = document.getElementById('sf-consent');
    if (el) el.remove();
  }

  function showBanner() {
    removeBanner();
    if (!document.getElementById('sf-consent-style')) {
      var st = document.createElement('style');
      st.id = 'sf-consent-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    var box = document.createElement('div');
    box.id = 'sf-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-labelledby', 'sf-consent-title');
    var title = document.createElement('h2');
    title.id = 'sf-consent-title';
    title.textContent = 'Statistiche anonime del sito';

    var text = document.createElement('p');
    text.appendChild(document.createTextNode(
      'Vorremmo usare Google Analytics per capire quante persone visitano il sito e quali pagine servono. ' +
      'Succede solo se accetti: se rifiuti non carichiamo nulla di Google. Puoi cambiare idea in qualsiasi momento da ' +
      '\u201cPreferenze cookie\u201d in fondo alla pagina. '
    ));
    var more = document.createElement('a');
    more.href = '/privacy#cookie';
    more.textContent = 'Maggiori informazioni';
    text.appendChild(more);
    text.appendChild(document.createTextNode('.'));

    var row = document.createElement('div');
    row.className = 'sf-row';
    var reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'sf-reject';
    reject.textContent = 'Rifiuta';
    var accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'sf-accept';
    accept.textContent = 'Accetta';
    row.appendChild(reject);
    row.appendChild(accept);

    box.appendChild(title);
    box.appendChild(text);
    box.appendChild(row);
    document.body.appendChild(box);
    box.querySelector('.sf-reject').addEventListener('click', function () {
      saveChoice('denied');
      clearAnalyticsCookies();
      removeBanner();
    });
    box.querySelector('.sf-accept').addEventListener('click', function () {
      saveChoice('granted');
      loadAnalytics();
      removeBanner();
    });
    box.querySelector('.sf-reject').focus();
  }

  function init() {
    var choice = readChoice();
    if (choice === 'granted') loadAnalytics();
    else if (choice !== 'denied') showBanner();

    var links = document.querySelectorAll('[data-cookie-prefs]');
    Array.prototype.forEach.call(links, function (a) {
      a.hidden = false;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        showBanner();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
