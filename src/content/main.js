// ============================================================
// main.js — Content Script 非模块入口
// 使用动态 import() 加载所有模块（兼容性更好）
// ============================================================

(async function () {
  try {
    // 动态导入所有依赖模块
    const [
      { PageDetector },
      { ObserverManager },
      { AppEventCapturer },
      { MessageClassifier },
      { JobBadgeInjector },
      { AIReplyAssistant },
      { DebugPanel },
      { PAGE_TYPES },
      { MSG, SOURCE, buildMessage },
      { sendToBackground },
    ] = await Promise.all([
      import(chrome.runtime.getURL('src/content/page-detector.js')),
      import(chrome.runtime.getURL('src/content/observer-manager.js')),
      import(chrome.runtime.getURL('src/content/features/app-event-capturer.js')),
      import(chrome.runtime.getURL('src/content/features/message-classifier.js')),
      import(chrome.runtime.getURL('src/content/features/job-badge-injector.js')),
      import(chrome.runtime.getURL('src/content/features/ai-reply-assistant.js')),
      import(chrome.runtime.getURL('src/content/features/debug-panel.js')),
      import(chrome.runtime.getURL('src/shared/constants.js')),
      import(chrome.runtime.getURL('src/shared/message-protocol.js')),
      import(chrome.runtime.getURL('src/shared/utils.js')),
    ]);

    class ContentScriptApp {
      constructor() {
        this.pageInfo = null;
        this.observerManager = null;
        this.features = [];
        this.featureFlags = {};
        this.initialized = false;
        this.debugPanel = null;
      }

      async start() {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化调试面板（最先执行，以便捕获后续所有日志）
        try {
          this.debugPanel = new DebugPanel();
        } catch (e) {
          console.error('[BossHelper] DebugPanel创建失败:', e);
        }

        // 加载功能开关
        await this._loadFeatureFlags();

        // 检测页面类型
        this.pageInfo = PageDetector.detect();
        console.log('[BossHelper] Page detected:', this.pageInfo);

        // 初始化观察器
        this.observerManager = new ObserverManager(this.pageInfo);
        this.observerManager.initialize();

        // 按页面类型初始化功能模块
        this._initializeFeatures();

        // 监听 SPA 导航
        this._setupNavigationDetection();

        // 通知 background 页面已就绪
        try {
          await sendToBackground(buildMessage(MSG.PAGE_CHANGE, {
            pageType: this.pageInfo.pageType,
          }, SOURCE.CONTENT));
        } catch (err) {
          console.debug('[BossHelper] SW not ready:', err.message);
        }
      }

      async _loadFeatureFlags() {
        try {
          const { payload = {} } = await sendToBackground(
            buildMessage(MSG.GET_FEATURE_FLAGS, {}, SOURCE.CONTENT)
          );
          this.featureFlags = payload;
        } catch {
          this.featureFlags = {
            jobBadges: true,
            messageClassification: true,
            appTracking: true,
          };
        }
      }

      _initializeFeatures() {
        const { pageType } = this.pageInfo;

        if (this.featureFlags.appTracking !== false) {
          const capturer = new AppEventCapturer(this.pageInfo, this.observerManager);
          capturer.initialize();
          this.features.push(capturer);
        }

        // AI 对话助手 — 职位详情页（抓JD）+ 聊天页（完整功能）
        if (pageType === PAGE_TYPES.JOB_DETAIL || pageType === PAGE_TYPES.CHAT ||
            pageType === PAGE_TYPES.JOB_LIST || pageType === PAGE_TYPES.CANDIDATE_HOME) {
          const aiAssistant = new AIReplyAssistant(this.pageInfo);
          aiAssistant.initialize().then(() => {
            aiAssistant.show();
          });
          this.features.push(aiAssistant);
        }

        if (this.featureFlags.messageClassification !== false &&
            pageType === PAGE_TYPES.CHAT) {
          const classifier = new MessageClassifier(this.pageInfo, this.observerManager);
          classifier.initialize();
          this.features.push(classifier);
        }

        if (this.featureFlags.jobBadges !== false &&
            (pageType === PAGE_TYPES.JOB_LIST || pageType === PAGE_TYPES.CANDIDATE_HOME)) {
          const badgeInjector = new JobBadgeInjector(this.pageInfo, this.observerManager);
          badgeInjector.initialize();
          this.features.push(badgeInjector);
        }

        console.log('[BossHelper] Features initialized:', this.features.map(f => f.constructor.name));
      }

      _setupNavigationDetection() {
        let lastUrl = window.location.href;
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        const handleUrlChange = () => {
          const currentUrl = window.location.href;
          if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            this._onPageChange();
          }
        };

        history.pushState = function (...args) {
          originalPushState.apply(this, args);
          handleUrlChange();
        };

        history.replaceState = function (...args) {
          originalReplaceState.apply(this, args);
          handleUrlChange();
        };

        window.addEventListener('popstate', handleUrlChange);
        window.addEventListener('hashchange', handleUrlChange);
      }

      _onPageChange() {
        const newPageInfo = PageDetector.detect();

        // 同类型页面通常不需要重建，但以下例外：
        // - JOB_DETAIL: 切换职位时 JD 会变
        // - CHAT: 切换聊天对象时 conversationId 会变
        if (newPageInfo.pageType === this.pageInfo.pageType &&
            newPageInfo.pageType !== PAGE_TYPES.JOB_DETAIL &&
            newPageInfo.pageType !== PAGE_TYPES.CHAT) {
          this.pageInfo = newPageInfo;
          return;
        }

        console.log('[BossHelper] Page changed:', this.pageInfo.pageType, '→', newPageInfo.pageType);

        for (const feature of this.features) {
          try { feature.destroy?.(); } catch (e) { /* ignore */ }
        }
        this.features = [];

        this.pageInfo = newPageInfo;
        this._initializeFeatures();

        try {
          sendToBackground(buildMessage(MSG.PAGE_CHANGE, {
            pageType: newPageInfo.pageType,
          }, SOURCE.CONTENT));
        } catch { /* ignore */ }
      }
    }

    // 启动
    const app = new ContentScriptApp();

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      app.start();
    } else {
      document.addEventListener('DOMContentLoaded', () => app.start());
    }

  } catch (err) {
    // 如果 import 失败，注入错误提示
    const el = document.createElement('div');
    el.textContent = '❌ BOSS助手加载失败: ' + err.message;
    el.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;background:#f44;color:#fff;padding:4px 10px;font:bold 12px sans-serif;';
    (document.documentElement || document.body).appendChild(el);
  }
})();
