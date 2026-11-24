<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>悟空 API文档</title>
  <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
  <meta name="description" content="Description">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0">
  <link rel="stylesheet" href="/doc/css/vue.min.css">
  <style>
    .wk-doc-toolbar {
      position: fixed;
      right: 24px;
      bottom: 88px;
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(148, 163, 184, 0.18);
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      backdrop-filter: blur(12px);
    }

    .wk-doc-lang-btn {
      border: none;
      background: transparent;
      color: #475569;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s ease, color 0.2s ease;
    }

    .wk-doc-lang-btn:hover {
      background: rgba(37, 99, 235, 0.08);
      color: #1d4ed8;
    }

    .wk-doc-lang-btn.is-active {
      background: #2563eb;
      color: #fff;
    }

    .wk-home-link {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 999px;
      background: #2563eb;
      color: #fff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(37, 99, 235, 0.28);
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }

    .wk-home-link:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
      box-shadow: 0 14px 36px rgba(37, 99, 235, 0.32);
    }

    @media (max-width: 640px) {
      .wk-doc-toolbar {
        right: 16px;
        bottom: 72px;
      }

      .wk-home-link {
        right: 16px;
        bottom: 16px;
        padding: 10px 14px;
      }
    }
  </style>
</head>
<body>
  <div id="app">悟空 API文档正在加载中，请耐心等待...</div>
  <div class="wk-doc-toolbar" aria-label="Language switcher">
    <button type="button" class="wk-doc-lang-btn" data-lang="zh">中文</button>
    <button type="button" class="wk-doc-lang-btn" data-lang="en">EN</button>
  </div>
  <a class="wk-home-link" href="https://wukong.support/" target="_self" aria-label="返回首页">
    <span>←</span>
    <span>返回首页</span>
  </a>
  <script>
    (function () {
      var DOC_LANG_STORAGE_KEY = 'wk-doc-lang';
      var APP_LANG_STORAGE_KEY = 'i18nextLng';

      function normalizeDocLanguage(value) {
        var language = (value || '').toLowerCase();
        return language.indexOf('en') === 0 ? 'en' : 'zh';
      }

      function readPreferredDocLanguage() {
        var searchParams = new URLSearchParams(window.location.search);
        var queryLang = searchParams.get('lang');
        if (queryLang) {
          return normalizeDocLanguage(queryLang);
        }

        try {
          var storedDocLanguage = window.localStorage.getItem(DOC_LANG_STORAGE_KEY);
          if (storedDocLanguage) {
            return normalizeDocLanguage(storedDocLanguage);
          }

          var appLanguage = window.localStorage.getItem(APP_LANG_STORAGE_KEY);
          if (appLanguage) {
            return normalizeDocLanguage(appLanguage);
          }
        } catch (error) {
          console.warn('Failed to read doc language from storage', error);
        }

        return 'zh';
      }

      function clearLanguageQueryParam() {
        var url = new URL(window.location.href);
        if (!url.searchParams.has('lang')) {
          return;
        }

        url.searchParams.delete('lang');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }

      function stripEnglishPrefix(pathname) {
        if (pathname === '/en') {
          return '/';
        }
        if (pathname.indexOf('/en/') === 0) {
          return pathname.slice(3);
        }
        return pathname || '/';
      }

      function buildHashForLanguage(language, currentHash) {
        var rawHash = currentHash || '#/';
        var hashBody = rawHash.charAt(0) === '#' ? rawHash.slice(1) : rawHash;
        if (!hashBody) {
          hashBody = '/';
        }

        var hashParts = hashBody.split('?');
        var hashPath = stripEnglishPrefix(hashParts[0] || '/');
        var hashQuery = hashParts[1] ? '?' + hashParts[1] : '';
        var normalizedPath = hashPath === '' ? '/' : hashPath;

        if (language === 'en') {
          var englishPath = normalizedPath === '/' ? '/en/' : '/en' + normalizedPath;
          return '#' + englishPath + hashQuery;
        }

        return '#' + normalizedPath + hashQuery;
      }

      function persistLanguage(language) {
        try {
          window.localStorage.setItem(DOC_LANG_STORAGE_KEY, language);
          window.localStorage.setItem(APP_LANG_STORAGE_KEY, language === 'en' ? 'en' : 'zh-CN');
        } catch (error) {
          console.warn('Failed to persist doc language', error);
        }
      }

      var currentDocLanguage = readPreferredDocLanguage();
      clearLanguageQueryParam();
      var targetHash = buildHashForLanguage(currentDocLanguage, window.location.hash || '#/');
      if (targetHash !== (window.location.hash || '#/')) {
        window.location.hash = targetHash;
      }

      persistLanguage(currentDocLanguage);

      var loadingText = currentDocLanguage === 'en'
        ? 'Wukong API docs are loading, please wait...'
        : '悟空 API文档正在加载中，请耐心等待...';
      var homeText = currentDocLanguage === 'en' ? 'Back Home' : '返回首页';
      var docTitle = currentDocLanguage === 'en' ? 'Wukong API Docs' : '悟空 API文档';

      document.documentElement.lang = currentDocLanguage === 'en' ? 'en' : 'zh-CN';
      document.title = docTitle;
      document.getElementById('app').textContent = loadingText;

      var homeLink = document.querySelector('.wk-home-link');
      if (homeLink) {
        homeLink.setAttribute('aria-label', homeText);
        var homeLinkLabel = homeLink.querySelector('span:last-child');
        if (homeLinkLabel) {
          homeLinkLabel.textContent = homeText;
        }
      }

      var languageButtons = document.querySelectorAll('.wk-doc-lang-btn');
      languageButtons.forEach(function (button) {
        var buttonLanguage = button.getAttribute('data-lang');
        button.classList.toggle('is-active', buttonLanguage === currentDocLanguage);
        button.addEventListener('click', function () {
          if (buttonLanguage === currentDocLanguage) {
            return;
          }

          persistLanguage(buttonLanguage);
          window.location.hash = buildHashForLanguage(buttonLanguage, window.location.hash || '#/');
          window.location.reload();
        });
      });

    window.$docsify = {
      name: docTitle,
      loadSidebar: true,
      homepage: currentDocLanguage === 'en' ? '/en/README.md' : '/README.md',
      alias: currentDocLanguage === 'en'
        ? {
            '/en/.*/_sidebar.md': '/en/_sidebar.md',
            '/.*/_sidebar.md': '/en/_sidebar.md'
          }
        : {
            '/.*/_sidebar.md': '/_sidebar.md'
          },
      subMaxLevel: 2,
      auto2top: true,
      // 缓存设置
      requestHeaders: {
        'cache-control': 'max-age=600',
      },
      notFoundPage: true,
     
    }
    })();
  </script>
  <!-- Docsify v4 -->
  <script src="/doc/js/docsify.min.js"></script>
  <script src="/doc/js/zoom-image.min.js"></script>
  <script src="/doc/js/docsify-copy-code.min.js"></script>
</body>
</html>
