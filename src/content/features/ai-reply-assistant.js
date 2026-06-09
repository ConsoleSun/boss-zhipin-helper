// ============================================================
// ai-reply-assistant.js — AI 对话助手浮动面板 v3
//
// 岗位列表模式：显示所有已保存的岗位，用户选择后加载
// AI 对话历史按岗位关联，可切换
// ============================================================

import { SELECTORS, findElement } from '../dom-selectors.js';
import { MSG, SOURCE, buildMessage } from '../../shared/message-protocol.js';
import { sendToBackground, setReactInputValue } from '../../shared/utils.js';

const AI_TIMEOUT = 15000;

function getAIEndpoint(provider) {
  if (provider === 'mimo') return 'https://api.xiaomimimo.com/v1/chat/completions';
  return 'https://api.deepseek.com/chat/completions';
}

export class AIReplyAssistant {
  constructor(pageInfo) {
    this.pageInfo = pageInfo;
    this.container = null;
    this.shadowRoot = null;
    this.visible = false;
    this.userSettings = {};
    this.savedJobs = [];           // 所有已保存的岗位
    this.selectedJob = null;      // 当前选中的岗位
    this.aiHistory = [];          // 当前岗位的 AI 对话历史
    this.messages = [];           // BOSS 聊天记录
    this.isLoading = false;
    this._lastAiReply = '';
    this._lastUserInput = '';     // 上一次用户输入（用于重新生成）
    this._replyMode = 'professional'; // 从 settings 中加载
    this._view = 'list';          // 'list' | 'chat'
    this._chatObserver = null;    // 聊天弹窗 MutationObserver
    this._currentConvId = null;   // 当前聊天弹窗的会话 ID
  }

  async initialize() {
    await this._loadData();
    this._injectPanel();
    this._render();
    this._startChatObserver();    // 监听聊天弹窗
    this._startContextMenu();     // 右击消息菜单
    window.__bhDebug?.('log', 'AI助手就绪 jobs=' + this.savedJobs.length + ' view=' + this._view);
  }

  // ==================== 数据加载 ====================

  async _loadData() {
    try {
      // 用户设置
      const settingsRes = await sendToBackground(buildMessage(MSG.GET_SETTINGS, {}));
      this.userSettings = settingsRes?.payload || {};
      this._replyMode = this.userSettings.replyMode || 'professional';

      // 已保存的岗位列表
      const { bh_jobs } = await chrome.storage.local.get('bh_jobs');
      this.savedJobs = bh_jobs || [];

      // 职位详情页：直接从页面提取 JD 并匹配已有记录
      if (this.pageInfo.pageType === 'job_detail') {
        const currentJob = this._extractCurrentPageJob();
        if (currentJob && currentJob.description) {
          // 在已保存记录中查找匹配
          const matched = this.savedJobs.find(j =>
            j.companyName === currentJob.companyName &&
            j.positionName === currentJob.positionName
          );
          if (matched) {
            // 更新匹配记录的 JD（可能之前没抓到）
            matched.description = currentJob.description;
            matched.salary = currentJob.salary || matched.salary;
            await chrome.storage.local.set({ bh_jobs: this.savedJobs });
            this.selectedJob = matched;
          } else {
            // 新岗位，加入列表
            this.selectedJob = currentJob;
            this.savedJobs.unshift(currentJob);
            // 异步保存
            const max = this.userSettings?.maxJobs || 30;
            const pinned = this.savedJobs.filter(j => j.pinned);
            const unpinned = this.savedJobs.filter(j => !j.pinned);
            chrome.storage.local.set({ bh_jobs: [...pinned, ...unpinned.slice(0, max)] });
          }
          this._view = 'chat';
          window.__bhDebug?.('log', '📋 当前职位: ' + currentJob.positionName + ' JD=' + (currentJob.description || '').length + '字');
        }
      }

      // 搜索/列表页：监听岗位卡片点击，提取右侧详情面板的 JD
      if (this.pageInfo.pageType === 'job_list' || this.pageInfo.pageType === 'home') {
        this._watchSearchPageDetail();
        window.__bhDebug?.('log', '📋 搜索页，已加载 ' + this.savedJobs.length + ' 个岗位，监听详情面板');
      }

      // 如果有 conversationId，加载 BOSS 聊天记录
      if (this.pageInfo.conversationId) {
        const msgsRes = await sendToBackground(buildMessage(MSG.GET_MESSAGES, {
          conversationId: this.pageInfo.conversationId,
        }));
        if (msgsRes?.success) {
          this.messages = msgsRes.payload || [];
        }
      }
    } catch (err) {
      window.__bhDebug?.('warn', '加载失败: ' + err.message);
    }
  }

  /**
   * 从当前职位详情页提取 JD（与 greeting-injector 共用清洗逻辑）
   */
  _extractCurrentPageJob() {
    const clean = (raw) => {
      if (!raw) return '';
      return raw
        .replace(/\s*\{[^}]*\}\s*/g, '')
        .replace(/[a-z]+![a-z]+;/gi, '')
        .replace(/\.[a-zA-Z0-9_-]+/g, '')
        .replace(/font-size\s*:\s*0/gi, '')
        .replace(/visibility\s*:\s*hidden/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    const sel = [
      '.job-detail-section', '.job-desc', '.job-detail-text',
      '.detail-bottom-text', '[class*="job-desc"]', '[class*="job-detail"]',
      // 智联招聘
      '.position-detail', '.position-description', '[class*="description"]',
      '.position-content', '.detail-content', '[class*="detail-content"]',
    ];
    let desc = '';
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) {
        const t = clean(el.innerText?.trim() || '');
        if (t.length > 50) { desc = t.substring(0, 2000); break; }
      }
    }

    if (!desc) return null;

    const posEl = findElement(SELECTORS.jobDetail?.positionName) || document.querySelector('h1, .job-title h1, .name h1');
    const compEl = findElement(SELECTORS.jobDetail?.companyName) || document.querySelector('.company-name, .company-info a');
    const salEl = findElement(SELECTORS.jobDetail?.salary) || document.querySelector('.salary, [class*="salary"]');

    return {
      positionName: (posEl?.textContent || '').trim().substring(0, 50),
      companyName: (compEl?.textContent || '').trim().substring(0, 50),
      salary: (salEl?.textContent || '').trim(),
      description: desc,
      savedAt: Date.now(),
      pinned: false,
    };
  }

  /**
   * 去重保存并选中岗位
   */
  async _upsertJobAndSelect(job) {
    const matched = this.savedJobs.find(j =>
      j.companyName === job.companyName && j.positionName === job.positionName
    );
    if (matched) {
      // 更新已有记录
      if (job.description) matched.description = job.description;
      if (job.salary) matched.salary = job.salary;
      if (job.location) matched.location = job.location;
      await chrome.storage.local.set({ bh_jobs: this.savedJobs });
      this.selectedJob = matched;
    } else {
      this.selectedJob = job;
      this.savedJobs.unshift(job);
      const max = this.userSettings?.maxJobs || 30;
      const pinned = this.savedJobs.filter(j => j.pinned);
      const unpinned = this.savedJobs.filter(j => !j.pinned);
      chrome.storage.local.set({ bh_jobs: [...pinned, ...unpinned.slice(0, max)] });
    }
  }

  /**
   * 从搜索页右侧详情面板提取当前选中岗位的 JD
   */
  _extractSearchPageJob() {
    const box = document.querySelector('.job-detail-box');
    if (!box || box.offsetParent === null) return null;

    const sel = SELECTORS.searchDetail;
    const posEl = findElement(sel.positionName, box);
    const compEl = findElement(sel.companyName, box);
    const salEl = findElement(sel.salary, box);
    const locEl = findElement(sel.location, box);
    const descEl = findElement(sel.jobDescription, box);

    const desc = (descEl?.innerText || '').trim().substring(0, 2000);
    if (!desc || desc.length < 50) return null; // 详情面板可能还没加载完

    return {
      positionName: (posEl?.textContent || '').trim().substring(0, 50),
      companyName: (compEl?.textContent || '').trim().substring(0, 50),
      salary: (salEl?.textContent || '').trim(),
      location: (locEl?.textContent || '').trim(),
      description: desc,
      savedAt: Date.now(),
      pinned: false,
    };
  }

  /**
   * 监听搜索页岗位卡片点击，自动提取右侧详情面板信息
   */
  _watchSearchPageDetail() {
    // 方式1: 监听 job-card 点击（事件委托）
    const handleJobCardClick = () => {
      // 延迟等待 React 渲染右侧面板
      setTimeout(() => {
        const job = this._extractSearchPageJob();
        if (job) {
          this._upsertJobAndSelect(job);
          this._view = 'chat';
          window.__bhDebug?.('log', '📋 搜索页选中岗位: ' + job.positionName + ' JD=' + job.description.length + '字');
          this._render();
        }
      }, 600);
    };

    // 在 job-list-container 上做事件委托
    const listContainer = document.querySelector('.job-list-container, [class*="job-list"]');
    if (listContainer) {
      listContainer.addEventListener('click', (e) => {
        const card = e.target.closest('[class*="job-card"], .job-item, li[class*="job"]');
        if (card) handleJobCardClick();
      });
    }

    // 方式2: MutationObserver 监听详情面板变化（兜底）
    const detailBox = document.querySelector('.job-detail-box');
    if (detailBox) {
      this._detailObserver?.disconnect();
      let detailTimer = null;
      this._detailObserver = new MutationObserver(() => {
        clearTimeout(detailTimer);
        detailTimer = setTimeout(() => {
          const job = this._extractSearchPageJob();
          if (job) {
            // 检查是否和已有选中岗位不同
            if (!this.selectedJob ||
                this.selectedJob.positionName !== job.positionName ||
                this.selectedJob.companyName !== job.companyName) {
              this._upsertJobAndSelect(job);
              this._view = 'chat';
              window.__bhDebug?.('log', '📋 详情面板更新: ' + job.positionName);
              this._render();
            }
          }
        }, 500);
      });
      observer.observe(detailBox, { childList: true, subtree: true, characterData: true });
    }
  }

  async _selectJob(job) {
    this.selectedJob = job;

    // 加载该岗位的 AI 对话历史
    const { bh_ai_history } = await chrome.storage.local.get('bh_ai_history');
    const all = bh_ai_history || [];
    this.aiHistory = all.filter(h =>
      h.companyName === job.companyName && h.positionName === job.positionName
    );

    // 也加载该公司的 BOSS 聊天记录（如果还没加载）
    if (this.messages.length === 0) {
      try {
        const appsRes = await sendToBackground(buildMessage(MSG.GET_APPLICATIONS, { limit: 100 }));
        if (appsRes?.success) {
          const apps = appsRes.payload || [];
          const matched = apps.find(a =>
            a.companyName === job.companyName && a.jobTitle === job.positionName
          );
          if (matched?.conversationId) {
            const msgsRes = await sendToBackground(buildMessage(MSG.GET_MESSAGES, {
              conversationId: matched.conversationId,
            }));
            if (msgsRes?.success) {
              this.messages = msgsRes.payload || [];
            }
          }
        }
      } catch {}
    }

    this._view = 'chat';
    window.__bhDebug?.('log', '选中岗位: ' + job.positionName + ' aiHistory=' + this.aiHistory.length);
  }

  // ==================== 面板 UI ====================

  _injectPanel() {
    this.container = document.createElement('div');
    this.container.id = 'bh-ai-assistant';
    this.container.style.cssText = `
      position: fixed; top: 60px; right: 10px; z-index: 2147483640;
      width: 420px; height: 550px;
      display: none; border-radius: 12px; overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.25);
      font-family: -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
      font-size: 13px; resize: both; min-width: 340px; min-height: 350px;
    `;
    this.shadowRoot = this.container.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = this._buildHTML();
    document.body.appendChild(this.container);
    this._bindEvents();
    this._enableDrag();
  }

  _buildHTML() {
    return `
      <style>
        :host { all: initial; }
        .panel { display: flex; flex-direction: column; height: 100%;
          background: rgba(255,255,255,0.82); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.7); border-radius: 14px; overflow: hidden; }
        .hdr { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;
          padding: 11px 16px;
          background: linear-gradient(135deg,#667eea 0%,#764ba2 50%,#5b3cc4 100%);
          color: #fff; cursor: move; user-select: none;
          box-shadow: 0 4px 20px rgba(102,126,234,0.25); }
        .hdr h3 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.3px; text-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .hdr-btns { display: flex; gap: 4px; }
        .hdr-btns button { width: 26px; height: 26px; border: 1px solid rgba(255,255,255,0.3);
          border-radius: 50%; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer;
          font-size: 14px; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; }
        .hdr-btns button:hover { background: rgba(255,255,255,0.28); transform: scale(1.08); }

        .content { flex: 1 1 auto; overflow-y: auto; min-height: 0; }

        /* 岗位列表 */
        .job-list { padding: 10px; }
        .job-item { padding: 13px 14px; border: 1px solid rgba(0,0,0,0.04); border-radius: 12px;
          margin-bottom: 6px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
          background: rgba(255,255,255,0.5); box-shadow: 0 2px 8px rgba(0,0,0,0.03); position: relative; }
        .job-item:hover { border-color: rgba(102,126,234,0.25); background: rgba(255,255,255,0.75);
          transform: translateX(2px); box-shadow: 0 4px 16px rgba(102,126,234,0.08); }
        .job-item .name { font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #2c3e50; }
        .job-item .meta { font-size: 11px; color: #8e8ea0; }
        .job-item .meta span { margin-right: 10px; }
        .job-item .badge { display: inline-block; padding: 2px 10px; border-radius: 12px;
          font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
          background: rgba(0,0,0,0.04); color: #8e8ea0; }
        .job-item .badge.has-ai { background: rgba(82,196,26,0.08); color: #52c41a; }
        .pin-btn, .del-btn { opacity: 0.3; transition: all 0.2s ease; }
        .pin-btn:hover, .del-btn:hover { opacity: 1; transform: scale(1.15); }
        .empty { text-align: center; padding: 36px 20px; color: #b0b0c0; }
        .empty .icon { font-size: 40px; margin-bottom: 10px; }
        .empty .hint { font-size: 12px; color: #b0b0c0; margin-top: 6px; line-height: 1.6; }

        /* 聊天模式 */
        .chat-area { /* flows naturally in scrollable .content */ }
        .chat-header {
          padding: 10px 16px;
          background: rgba(102,126,234,0.04);
          border-bottom: 1px solid rgba(0,0,0,0.04);
          display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
        .chat-header .title { font-weight: 600; color: #2c3e50; }
        .chat-header button { font-size: 11px; padding: 4px 12px; border: 1px solid rgba(0,0,0,0.06);
          border-radius: 8px; background: rgba(255,255,255,0.6); cursor: pointer;
          transition: all 0.2s ease; font-weight: 500; }
        .chat-header button:hover { border-color: rgba(102,126,234,0.2); color: #667eea; }

        .history-section { max-height: 220px; overflow-y: auto; padding: 10px 16px; }
        .section-label { font-size: 11px; color: #8e8ea0; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .bubble { margin-bottom: 8px; padding: 8px 12px; border-radius: 10px;
          font-size: 12px; line-height: 1.5; word-break: break-word;
          backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
          border: 1px solid rgba(255,255,255,0.5); }
        .bubble.hr { background: rgba(24,144,255,0.06); border-left: 3px solid #1890ff; }
        .bubble.user { background: rgba(82,196,26,0.06); border-left: 3px solid #52c41a; }
        .bubble.ai { background: rgba(114,46,209,0.06); border-left: 3px solid #722ed1; }
        .bubble .tag { font-size: 10px; font-weight: 700; margin-bottom: 3px; letter-spacing: 0.3px; }
        .bubble.hr .tag { color: #1677cc; }
        .bubble.user .tag { color: #389e0d; }
        .bubble.ai .tag { color: #722ed1; }
        .bubble .time { font-size: 10px; color: #b0b0c0; margin-top: 3px; text-align: right; }

        .input-section { padding: 12px 16px; border-top: 1px solid rgba(0,0,0,0.04);
          background: rgba(255,255,255,0.4); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
        .input-section textarea { width: 100%; height: 58px; padding: 10px 12px;
          border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; font-size: 12px;
          font-family: inherit; resize: vertical; box-sizing: border-box; outline: none;
          background: rgba(255,255,255,0.6); transition: all 0.25s ease; }
        .input-section textarea:focus { border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102,126,234,0.08); background: rgba(255,255,255,0.85); }
        .btn-row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
        .btn { padding: 6px 14px; border: 1px solid rgba(0,0,0,0.06); border-radius: 8px;
          font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
          background: rgba(255,255,255,0.6); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
          color: #5a5a72; transition: all 0.2s cubic-bezier(0.4,0,0.2,1); letter-spacing: 0.2px; }
        .btn:hover { border-color: rgba(102,126,234,0.25); color: #667eea;
          background: rgba(255,255,255,0.8); transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102,126,234,0.1); }
        .btn.primary { background: linear-gradient(135deg,#667eea,#764ba2); color: #fff; border: none;
          box-shadow: 0 4px 12px rgba(102,126,234,0.3); }
        .btn.primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102,126,234,0.4); }
        .btn.primary:disabled { opacity: 0.45; transform: none; box-shadow: none; }
        .btn:active { transform: translateY(0); }

      </style>

      <div class="panel">
        <div class="hdr">
          <h3>🤖 AI 对话助手</h3>
          <div class="hdr-btns">
            <button id="bh-ai-back" style="display:none;">◀</button>
            <button id="bh-ai-minimize">−</button>
            <button id="bh-ai-close">×</button>
          </div>
        </div>
        <div class="content" id="bh-ai-content"></div>
      </div>
    `;
  }

  _render() {
    const content = this.shadowRoot.getElementById('bh-ai-content');
    const backBtn = this.shadowRoot.getElementById('bh-ai-back');

    if (this._view === 'list' || !this.selectedJob) {
      backBtn.style.display = 'none';
      content.innerHTML = this._renderJobList();
    } else {
      backBtn.style.display = 'inline-block';
      content.innerHTML = this._renderChat();
    }
  }

  _renderJobList() {
    if (this.savedJobs.length === 0) {
      return `
        <div class="empty">
          <div class="icon">📋</div>
          <div>还没有保存任何职位</div>
          <div class="hint">请先打开职位详情页面<br>系统会自动保存职位信息</div>
        </div>`;
    }

    // 置顶排前面，存入实例变量
    this._sortedJobs = [...this.savedJobs].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    return '<div class="job-list">' +
      '<div style="padding:0 4px 8px;">' +
        '<input type="text" id="bh-job-search" placeholder="🔍 搜索岗位名或公司名..." style="width:100%;padding:6px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:12px;box-sizing:border-box;" />' +
      '</div>' +
      '<div id="bh-job-items">' +
      this._renderJobItems(this._sortedJobs) +
      '</div>' +
      '</div>';
  }

  _renderJobItems(jobs) {
    if (jobs.length === 0) {
      return '<div style="text-align:center;padding:20px;color:#ccc;">没有匹配的岗位</div>';
    }
    return jobs.map((job, i) => {
        const savedDate = job.savedAt ? new Date(job.savedAt).toLocaleDateString('zh-CN') : '';
        const hasJD = job.description?.length > 50;
        const pinIcon = job.pinned ? '📌' : '📍';
        const pinTitle = job.pinned ? '取消置顶' : '置顶';
        return `
          <div class="job-item" data-index="${i}" data-company="${this._esc(job.companyName)}" data-position="${this._esc(job.positionName)}" style="${job.pinned ? 'border-left:3px solid #faad14;' : ''}">
            <div class="name">
              ${job.pinned ? '📌 ' : ''}${this._esc(job.positionName || '未知职位')}
              <div style="float:right;display:flex;gap:4px;">
                <button class="pin-btn" data-action="pin" data-company="${this._esc(job.companyName)}" data-position="${this._esc(job.positionName)}" title="${pinTitle}" style="background:none;border:none;cursor:pointer;font-size:16px;padding:0;">${pinIcon}</button>
                <button class="del-btn" data-action="delete" data-company="${this._esc(job.companyName)}" data-position="${this._esc(job.positionName)}" title="删除" style="background:none;border:none;cursor:pointer;font-size:14px;padding:0;opacity:0.3;">🗑️</button>
              </div>
            </div>
            <div class="meta">
              <span>🏢 ${this._esc(job.companyName || '未知')}</span>
              <span>💰 ${this._esc(job.salary || '面议')}</span>
              ${savedDate ? '<span>📅 ' + savedDate + '</span>' : ''}
            </div>
            <div class="meta" style="margin-top:4px;">
              <span class="badge ${hasJD ? 'has-ai' : ''}">${hasJD ? '✅ 有JD' : '⚠️ 无JD'}</span>
              <span>JD ${(job.description || '').length}字</span>
            </div>
          </div>`;
      }).join('');
  }

  _renderChat() {
    const job = this.selectedJob || {};
    const jdPreview = (job.description || '').substring(0, 400);
    const hasAi = this.aiHistory.length > 0;

    return `
      <div class="chat-area">
        <div class="chat-header">
          <span class="title">${this._esc(job.positionName || '未匹配岗位')} @ ${this._esc(job.companyName || '')}</span>
          <span style="color:#999;font-size:11px;">${hasAi ? this.aiHistory.length + '条记录' : ''}</span>
        </div>

        <div class="history-section" id="bh-ai-scroll">
          ${jdPreview ? `
            <div class="section-label">📋 职位描述摘要</div>
            <div class="bubble hr"><div>${this._esc(jdPreview)}...</div></div>
          ` : ''}

          ${hasAi ? `
            <div class="section-label" style="margin-top:8px;">🤖 AI对话历史</div>
            ${this.aiHistory.slice(-10).map(h => `
              <div class="bubble hr"><div class="tag">📥 输入 · ${new Date(h.timestamp).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div><div>${this._esc(h.userInput)}</div></div>
              <div class="bubble ai"><div class="tag">🤖 AI回复</div><div>${this._esc(h.aiReply)}</div></div>
            `).join('')}
          ` : ''}

          ${!hasAi && !jdPreview ? '<div class="empty"><div class="icon">📭</div><div>暂无记录</div></div>' : ''}
        </div>

        <div class="input-section">
          <textarea id="bh-ai-input" placeholder="粘贴HR消息，然后点发送或Ctrl+Enter..."></textarea>
          <div class="btn-row">
            <button class="btn" id="bh-ai-paste">📋 粘贴</button>
            <button class="btn primary" id="bh-ai-send">🤖 发送给AI</button>
            <button class="btn" id="bh-ai-regenerate" ${!this._lastUserInput ? 'disabled' : ''} style="${!this._lastUserInput ? 'opacity:0.4;' : ''}">🔄 重新生成</button>
            <button class="btn" id="bh-ai-greet" style="${!this.selectedJob?.description ? 'opacity:0.4;' : ''}">👋 打招呼</button>
            <button class="btn" id="bh-ai-fill" style="margin-left:auto;">✏️ 填入聊天框</button>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== 事件绑定 ====================

  _bindEvents() {
    const root = this.shadowRoot;

    root.getElementById('bh-ai-close').addEventListener('click', () => this.hide());
    root.getElementById('bh-ai-minimize').addEventListener('click', () => {
      const content = root.getElementById('bh-ai-content');
      const btn = root.getElementById('bh-ai-minimize');
      const hidden = content.style.display === 'none';
      content.style.display = hidden ? '' : 'none';
      btn.textContent = hidden ? '−' : '+';
    });

    // 返回列表
    root.getElementById('bh-ai-back').addEventListener('click', () => {
      this._view = 'list';
      this._render();
    });

    // 岗位列表点击（事件委托）
    root.addEventListener('click', async (e) => {
      // 置顶按钮
      const pinBtn = e.target.closest('.pin-btn');
      if (pinBtn) {
        e.stopPropagation();
        await this._togglePin(pinBtn.dataset.company, pinBtn.dataset.position);
        return;
      }
      // 删除按钮
      const delBtn = e.target.closest('.del-btn');
      if (delBtn) {
        e.stopPropagation();
        await this._deleteJob(delBtn.dataset.company, delBtn.dataset.position);
        return;
      }

      const item = e.target.closest('.job-item');
      if (item) {
        // 用公司名+职位名精确匹配（搜索过滤后索引不可靠）
        const job = this.savedJobs.find(j =>
          j.companyName === item.dataset.company &&
          j.positionName === item.dataset.position
        ) || this._sortedJobs?.[parseInt(item.dataset.index)];
        if (job) {
          await this._selectJob(job);
          this._render();
          setTimeout(() => {
            const scroll = root.getElementById('bh-ai-scroll');
            if (scroll) scroll.scrollTop = scroll.scrollHeight;
          }, 100);
        }
      }
    });

    // 粘贴按钮（chat模式下动态绑定）
    root.addEventListener('click', (e) => {
      if (e.target.id === 'bh-ai-paste') {
        navigator.clipboard.readText().then(t => {
          const ta = root.getElementById('bh-ai-input');
          if (ta && t) ta.value = t;
        }).catch(() => {});
      }
      if (e.target.id === 'bh-ai-send') this._generateReply(false);
      if (e.target.id === 'bh-ai-greet') this._autoGenerateGreeting();
      if (e.target.id === 'bh-ai-regenerate' && this._lastUserInput) this._generateReply(true);
      if (e.target.id === 'bh-ai-fill') {
        this._fillToChatInput(this._lastAiReply || '');
      }
    });

    // 搜索框
    root.addEventListener('input', (e) => {
      if (e.target.id === 'bh-job-search') {
        const q = e.target.value.trim().toLowerCase();
        const filtered = q
          ? this._sortedJobs.filter(j =>
              (j.positionName || '').toLowerCase().includes(q) ||
              (j.companyName || '').toLowerCase().includes(q))
          : this._sortedJobs;
        const container = root.getElementById('bh-job-items');
        if (container) container.innerHTML = this._renderJobItems(filtered);
      }
    });

    // Ctrl+Enter 发送
    root.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter' && e.target.id === 'bh-ai-input') {
        e.preventDefault();
        this._generateReply();
      }
    });
  }

  // ==================== 拖拽 ====================

  _enableDrag() {
    const header = this.shadowRoot.querySelector('.hdr');
    let dragging = false, sx, sy, ol, ot;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true; sx = e.clientX; sy = e.clientY;
      const r = this.container.getBoundingClientRect();
      ol = r.left; ot = r.top;
      this.container.style.right = 'auto';
      this.container.style.left = ol + 'px';
      this.container.style.top = ot + 'px';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.container.style.left = Math.max(0, ol + e.clientX - sx) + 'px';
      this.container.style.top = Math.max(0, ot + e.clientY - sy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ==================== AI 生成 ====================

  async _generateReply(regenerate = false) {
    const root = this.shadowRoot;
    const input = root.getElementById('bh-ai-input');
    if (!input) return;

    // 重新生成时用上一次的输入，否则取当前输入
    let text;
    if (regenerate) {
      text = this._lastUserInput;
      if (!text) return;
      if (input) input.value = text;
    } else {
      text = input.value.trim();
      if (!text) return;
      this._lastUserInput = text;
    }

    const provider = this.userSettings.aiProvider || 'deepseek';
    const apiKey = provider === 'mimo' ? this.userSettings.mimoApiKey : this.userSettings.deepseekApiKey;
    if (!apiKey) {
      window.__bhDebug?.('error', '未配置 ' + (provider === 'mimo' ? 'MIMO' : 'DeepSeek') + ' API Key');
      return;
    }

    this.isLoading = true;
    const sendBtn = root.getElementById('bh-ai-send');
    const regenBtn = root.getElementById('bh-ai-regenerate');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '⏳ ...'; }
    if (regenBtn) { regenBtn.disabled = true; regenBtn.textContent = '⏳ ...'; }

    try {
      const reply = await this._callAI(text, apiKey);
      this._lastAiReply = reply;
      window.__bhDebug?.('log', 'AI回复(' + (regenerate ? '重新生成' : '') + reply.length + '字 mode=' + this._replyMode + ')');

      // 保存并直接显示在聊天历史中
      await this._saveAIConversation(text, reply);
      this._render();
    } catch (err) {
      window.__bhDebug?.('error', 'AI失败: ' + (err.message || err));
    } finally {
      this.isLoading = false;
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '🤖 发送给AI'; }
      if (regenBtn) { regenBtn.disabled = false; regenBtn.textContent = '🔄 重新生成'; }
    }
  }

  async _callAI(userMessage, apiKey) {
    const provider = this.userSettings.aiProvider || 'deepseek';
    const endpoint = getAIEndpoint(provider);
    const model = provider === 'mimo' ? 'mimo-v2.5-pro' : 'deepseek-chat';

    const controller = new AbortController();
    // MiMo 推理模型需要更长时间（推理+生成两步），DeepSeek 15s 足够
    const timeoutMs = provider === 'mimo' ? 45000 : AI_TIMEOUT;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: this._sysPrompt() },
            { role: 'user', content: this._userPrompt(userMessage) },
          ],
          temperature: 0.7, max_tokens: provider === 'mimo' ? 800 : 400,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const e = await resp.text().catch(() => '');
        throw new Error('HTTP ' + resp.status + (e ? ': ' + e.substring(0, 150) : ''));
      }

      const data = await resp.json();
      // MiMo 推理模型：content 可能为空，实际输出在 reasoning_content
      const msg = data?.choices?.[0]?.message || {};
      let content = msg.content || msg.reasoning_content || '';
      if (!content && provider === 'mimo') {
        // 兼容其他可能的字段名
        content = msg.text || msg.reply || '';
      }
      return content || '(空)';
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 职位详情页自动生成招呼语
   */
  async _autoGenerateGreeting() {
    if (!this.selectedJob?.description) return;
    if (this.isLoading) return; // 防止重复点击

    const provider = this.userSettings.aiProvider || 'deepseek';
    const apiKey = provider === 'mimo' ? this.userSettings.mimoApiKey : this.userSettings.deepseekApiKey;
    if (!apiKey) {
      window.__bhDebug?.('error', '未配置 ' + (provider === 'mimo' ? 'MIMO' : 'DeepSeek') + ' API Key');
      return;
    }

    this.isLoading = true;
    const root = this.shadowRoot;
    const greetBtn = root.getElementById('bh-ai-greet');
    if (greetBtn) { greetBtn.disabled = true; greetBtn.textContent = '⏳ ...'; }

    window.__bhDebug?.('log', '🤖 自动生成招呼语...');
    const text = '请为这个岗位生成一个打招呼语';
    this._lastUserInput = text;
    try {
      const reply = await this._callAI(text, apiKey);
      this._lastAiReply = reply;
      await this._saveAIConversation(text, reply);
      this._render();
      window.__bhDebug?.('log', '✅ 招呼语已生成(' + reply.length + '字)');
    } catch (err) {
      window.__bhDebug?.('error', '招呼语生成失败: ' + (err.message || err));
    } finally {
      this.isLoading = false;
      if (greetBtn) { greetBtn.disabled = false; greetBtn.textContent = '👋 打招呼'; }
    }
  }

  _sysPrompt() {
    // 通用前缀：明确角色是写作助手，避免模型误以为要代替用户做决定
    const prefix = `你是用户的求职写作助手。用户在BOSS直聘找工作，需要你帮忙起草回复消息。`;
    const suffix = `注意：只生成回复文本，不要加引号或解释。80-200字。`;

    if (this._replyMode === 'human') {
      return `${prefix}
风格：口语化、自然像真人聊天。可以适当用"~"、"哈哈"等表达，但别过度。
${suffix}`;
    }
    return `${prefix}
风格：简洁专业、条理清晰、商务得体。
${suffix}`;
  }

  _userPrompt(userMessage) {
    const p = [];
    if (this.selectedJob?.description) p.push('【职位描述】' + this.selectedJob.description.substring(0, 1000));
    if (this.selectedJob?.positionName) p.push('岗位：' + this.selectedJob.positionName);
    if (this.userSettings.userSkills) p.push('技能：' + this.userSettings.userSkills);
    if (this.userSettings.userExperience) p.push('经验：' + this.userSettings.userExperience);
    if (this.userSettings.expectedSalary) p.push('期望薪资：' + this.userSettings.expectedSalary);
    if (this.userSettings.resumeData?.fullText) p.push('【我的简历】\n' + this.userSettings.resumeData.fullText.substring(0, 2000));
    if (this.aiHistory.length > 0) {
      p.push('\n【AI对话历史】');
      this.aiHistory.slice(-5).forEach(h => {
        p.push('用户: ' + h.userInput + '\nAI: ' + h.aiReply);
      });
    }
    p.push('\n【用户问题/招聘者消息】\n' + userMessage);
    p.push('\n请生成回复：');
    return p.join('\n');
  }

  // ==================== 保存 ====================

  async _saveAIConversation(userInput, aiReply) {
    try {
      const { bh_ai_history } = await chrome.storage.local.get('bh_ai_history');
      const history = bh_ai_history || [];
      history.unshift({
        userInput, aiReply,
        positionName: this.selectedJob?.positionName || '',
        companyName: this.selectedJob?.companyName || '',
        timestamp: Date.now(),
      });
      const max = this.userSettings?.maxAiHistory || 50;
      await chrome.storage.local.set({ bh_ai_history: history.slice(0, max) });

      // 更新内存
      this.aiHistory.unshift({
        userInput, aiReply,
        positionName: this.selectedJob?.positionName || '',
        companyName: this.selectedJob?.companyName || '',
        timestamp: Date.now(),
      });
      this._render();
    } catch (err) {
      window.__bhDebug?.('warn', '保存失败: ' + err.message);
    }
  }

  // ==================== 工具 ====================

  _fillToChatInput(text) {
    const ta = document.querySelector('textarea:not([readonly]):not([disabled])');
    const ce = document.querySelector('[contenteditable="true"]');
    if (ta && ta.offsetParent !== null) {
      setReactInputValue(ta, text);
      ta.focus();
    } else if (ce && ce.offsetParent !== null) {
      ce.focus();
      ce.textContent = text;
      ce.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    window.__bhDebug?.('log', '已填入聊天框');
  }

  _esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  // ==================== 聊天弹窗实时捕获 ====================

  _startChatObserver() {
    // 方式1: MutationObserver 检测聊天弹窗 DOM 出现
    this._chatObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (this._isChatContainer(node)) {
            this._onChatModalOpened(node);
          }
        }
      }
    });
    this._chatObserver.observe(document.body, { childList: true, subtree: true });

    // 方式2: 监听 textarea 聚焦（切换聊天时输入框复用，不会触发 addedNodes）
    document.addEventListener('focusin', (e) => {
      if (e.target.tagName === 'TEXTAREA') {
        const panel = e.target.closest('[class*="chat"], [class*="im"], [class*="dialog"], [class*="panel"]');
        if (panel && this._isChatContainer(panel)) {
          this._onChatModalOpened(panel);
        }
      }
    }, true);

    // 方式3: 定期扫描（兜底），检测 HR 名称变化
    setInterval(() => {
      const panels = document.querySelectorAll('[class*="chat"], [class*="im-panel"], [class*="dialog"]');
      for (const panel of panels) {
        if (panel.querySelector('textarea') && panel.offsetParent !== null) {
          const convId = this._extractConvId(panel);
          if (convId && convId !== this._currentConvId) {
            this._onChatModalOpened(panel);
          }
          break;
        }
      }
    }, 1500);
  }

  // ==================== 右击菜单 ====================

  _startContextMenu() {
    let menuEl = null;

    const hideMenu = () => {
      if (menuEl) { menuEl.remove(); menuEl = null; }
    };

    document.addEventListener('contextmenu', (e) => {
      hideMenu();
      // 检测是否右键在聊天消息上
      const msgEl = e.target.closest('[class*="message-item"], [class*="msg-item"], [class*="chat-message"], [class*="message"]');
      if (!msgEl) return;
      const text = msgEl.textContent?.trim() || '';
      if (text.length < 3) return;
      // 如果是自己发的消息（右侧/绿色），跳过
      if (/user|self|send|right/i.test(msgEl.className || '')) return;

      e.preventDefault();
      menuEl = document.createElement('div');
      menuEl.style.cssText = `
        position: fixed; z-index: 2147483647;
        left: ${e.clientX}px; top: ${e.clientY}px;
        background: #fff; border: 1px solid #e8e8e8; border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15); padding: 4px 0;
        font-size: 13px; font-family: -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
        min-width: 160px;
      `;
      menuEl.innerHTML = `
        <div class="ctx-item" data-action="send" style="padding:8px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;">
          📤 发送到AI助手
        </div>
        <div class="ctx-item" data-action="copy" style="padding:8px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;">
          📋 复制文本
        </div>
      `;
      document.body.appendChild(menuEl);

      // 点击菜单项
      menuEl.querySelectorAll('.ctx-item').forEach(item => {
        item.addEventListener('mouseenter', () => { item.style.background = '#f5f5f5'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', () => {
          const action = item.dataset.action;
          if (action === 'send') {
            this._quickSend(text);
          } else if (action === 'copy') {
            navigator.clipboard.writeText(text).catch(() => {});
            window.__bhDebug?.('log', '已复制到剪贴板');
          }
          hideMenu();
        });
      });

      // 失焦关闭
      setTimeout(() => document.addEventListener('click', hideMenu, { once: true }), 0);
    });
  }

  _quickSend(text) {
    if (!this.visible) this.show();
    // 如果不在chat视图，先尝试切换
    // 填入输入框并自动发送
    const root = this.shadowRoot;
    const input = root.getElementById('bh-ai-input');
    if (input) {
      input.value = text;
      this._generateReply(false);
    }
    window.__bhDebug?.('log', '📤 右击消息已发送到AI');
  }

  _isChatContainer(node) {
    const hasTextarea = node.querySelector?.('textarea') || node.tagName === 'TEXTAREA';
    const hasMsgs = node.className?.includes?.('chat') ||
      node.className?.includes?.('im') ||
      node.className?.includes?.('dialog') ||
      node.className?.includes?.('panel') ||
      node.querySelector?.('[class*="chat"]') ||
      node.querySelector?.('[class*="im-panel"]') ||
      node.querySelector?.('[class*="message"]');
    return hasTextarea && hasMsgs;
  }

  async _onChatModalOpened(chatContainer) {
    const convId = this._extractConvId(chatContainer);
    if (!convId) return;

    // 同一个会话不重复加载
    if (convId === this._currentConvId) return;

    // 切换会话：重置旧状态
    window.__bhDebug?.('log', '🔄 切换会话: ' + (this._currentConvId || '无') + ' → ' + convId);
    this._currentConvId = convId;
    window.__bhDebug?.('log', '📨 检测到聊天弹窗 convId=' + convId);

    // 加载历史消息
    try {
      const result = await sendToBackground(buildMessage(MSG.GET_MESSAGES, { conversationId: convId }));
      if (result?.success && result.payload?.length > 0) {
        this.messages = result.payload;
        window.__bhDebug?.('log', '📜 加载历史 ' + this.messages.length + '条');
      }
    } catch {}

    // 匹配岗位（每次切换会话都重新匹配，不保留旧值）
    try {
      const appsRes = await sendToBackground(buildMessage(MSG.GET_APPLICATIONS, { limit: 100 }));
      let matchedJob = null;
      if (appsRes?.success) {
        const app = (appsRes.payload || []).find(a => a.conversationId === convId);
        if (app) {
          const { bh_jobs } = await chrome.storage.local.get('bh_jobs');
          matchedJob = (bh_jobs || []).find(j =>
            j.companyName === app.companyName && j.positionName === app.jobTitle
          ) || {
            positionName: app.jobTitle || '',
            companyName: app.companyName || '',
            description: '',
            savedAt: Date.now(),
          };
        }
      }
      if (matchedJob) {
        this.selectedJob = matchedJob;
        const { bh_ai_history } = await chrome.storage.local.get('bh_ai_history');
        this.aiHistory = (bh_ai_history || []).filter(h =>
          h.companyName === matchedJob.companyName &&
          h.positionName === matchedJob.positionName
        );
      }
      // 保留当前视图，不清空已选岗位
    } catch {}

    this._render();
    if (!this.visible) this.show();
  }

  _extractConvId(container) {
    // 方式1: URL 里的 chat ID（独立聊天页）
    const urlMatch = window.location.href.match(/\/chat\/([A-Za-z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];

    // 方式2: 找到聊天弹窗中 HR 名字/标题最具体的元素（通常是最内层的标题）
    const headers = container.querySelectorAll('h1, h2, h3, h4, h5, strong, span[class*="title"], div[class*="title"], span[class*="name"], div[class*="name"]');
    let hrName = '';
    for (const el of headers) {
      const t = el.textContent?.trim() || '';
      // 取最长的（通常职位名+公司名）
      if (t.length > hrName.length && t.length < 50 && !t.includes('BOSS') && !t.includes('直聘')) {
        hrName = t;
      }
    }
    // 方式3: 取整个弹窗可见文本的前50字作为特征
    if (!hrName) {
      hrName = (container.innerText || container.textContent || '').trim().substring(0, 50);
    }
    return hrName ? 'chat_' + hrName.replace(/\s+/g, '_').substring(0, 60) : 'chat_' + Date.now();
  }

  // ==================== 置顶 ====================

  async _deleteJob(company, position) {
    if (!confirm('确定删除「' + position + '」的记录吗？\n\n删除后岗位JD和AI对话历史将不可恢复。')) return;
    const { bh_jobs } = await chrome.storage.local.get('bh_jobs');
    const jobs = (bh_jobs || []).filter(j =>
      !(j.companyName === company && j.positionName === position)
    );
    await chrome.storage.local.set({ bh_jobs: jobs });
    this.savedJobs = jobs;
    // 如果删除的是当前选中岗位，清空
    if (this.selectedJob?.companyName === company && this.selectedJob?.positionName === position) {
      this.selectedJob = null;
      this._view = 'list';
    }
    this._render();
    window.__bhDebug?.('log', '🗑️ 已删除: ' + position);
  }

  async _togglePin(company, position) {
    const { bh_jobs } = await chrome.storage.local.get('bh_jobs');
    const jobs = bh_jobs || [];
    const found = jobs.find(j => j.companyName === company && j.positionName === position);
    if (found) {
      found.pinned = !found.pinned;
      await chrome.storage.local.set({ bh_jobs: jobs });
      // 更新内存
      const local = this.savedJobs.find(j => j.companyName === company && j.positionName === position);
      if (local) local.pinned = found.pinned;
      this._render();
      window.__bhDebug?.('log', (found.pinned ? '📌 已置顶: ' : '📍 取消置顶: ') + position);
    }
  }

  show() { this.visible = true; this.container.style.display = 'block'; }
  hide() { this.visible = false; this.container.style.display = 'none'; }
  destroy() {
    this._chatObserver?.disconnect();
    this._detailObserver?.disconnect();
    this.container?.remove();
  }
}
