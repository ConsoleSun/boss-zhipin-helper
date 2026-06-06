// ============================================================
// dom-selectors.js — 集中管理所有 DOM 选择器
// BOSS 改版时只需修改此文件
// 选择器按稳定性降序排列，每个目标提供多级回退
// ============================================================

export const SELECTORS = {
  // ==================== 职位详情页 ====================
  jobDetail: {
    // "立即沟通"按钮
    communicateButton: [
      // Priority 1: 数据追踪属性
      '[ka="boss-job-detail-start-im"]',
      'a[ka*="start-im"]',
      'a[ka*="沟通"]',
      // Priority 2: 稳定 class pattern
      'a.btn-start-im',
      'a.btn-start-chat',
      'div.job-boss > a.btn-start-chat',
      'div.job-op > a.btn-start-chat',
      '.job-detail-boss a[href*="chat"]',
      // Priority 3: 语义/aria
      'a[role="button"][aria-label*="沟通"]',
      'button[aria-label*="沟通"]',
      // Priority 4: 文本内容回退
      { type: 'text', tag: 'a', text: '立即沟通' },
      { type: 'text', tag: 'button', text: '立即沟通' },
      // Priority 5: XPath
      { type: 'xpath', expression: '//a[contains(text(), "立即沟通")]' },
    ],

    // 职位名称
    positionName: [
      'div.name > h1',
      'div.job-name > h1',
      '.job-title > h1',
      'div.job-detail-header h1',
      'div.detail-content h1',
      { type: 'xpath', expression: '//div[contains(@class, "name")]//h1' },
    ],

    // 公司名称
    companyName: [
      'a.company-name',
      '.company-info a:first-child',
      '.job-detail-company a',
      '.company-title a',
      'h3[title] a',
      { type: 'xpath', expression: '//a[contains(@href, "company") and contains(@class, "name")]' },
    ],

    // 薪资
    salary: [
      'span.salary',
      '.job-detail-header span.salary',
      '.job-salary',
      '[class*="salary"]',
    ],

    // 工作地点
    location: [
      '.job-location',
      'span.location',
      '[class*="location"]',
    ],

    // 职位描述
    jobDescription: [
      '.job-detail-section',
      '.job-desc',
      '.job-detail-text',
      '.detail-bottom-text',
      '[class*="job-desc"]',
    ],
  },

  // ==================== 聊天页 ====================
  chat: {
    // 消息列表容器
    messageContainer: [
      '.chat-messages',
      '.message-list',
      '.chat-list',
      '.dialog-list',
      '[class*="message"] > div',
      { role: 'log' },
    ],

    // 单条消息
    messageItems: [
      '.message-item',
      '.chat-message',
      '.msg-item',
      '[class*="message-item"]',
      '[class*="msg-item"]',
    ],

    // HR 消息（接收到的）
    hrMessage: [
      '.message-item.hr',
      '.chat-message--hr',
      '.msg-receive',
      '[class*="receive"]',
      '.message-left',
      '[class*="left"]',
    ],

    // 用户消息（发出的）
    userMessage: [
      '.message-item.user',
      '.chat-message--self',
      '.msg-send',
      '[class*="send"]',
      '.message-right',
      '[class*="self"]',
    ],

    // 消息文本内容
    messageText: [
      '.message-content-text',
      '.message-text',
      '.msg-text',
      '[class*="text"]',
      '[class*="content"]',
    ],

    // 消息时间戳
    messageTime: [
      '.message-time',
      '.msg-time',
      '[class*="time"]',
    ],

    // HR 头像/名称
    hrAvatar: [
      '.message-avatar',
      '.chat-avatar',
      '.msg-avatar img',
      '.avatar-img',
    ],

    // 输入框
    inputArea: [
      '.chat-input textarea',
      '.chat-input div[contenteditable="true"]',
      '.chat-msg-input',
      'div[contenteditable="true"]',
      'textarea[class*="input"]',
      'textarea[class*="chat"]',
      { tag: 'textarea', role: 'textbox' },
      { type: 'text', tag: 'textarea', text: '' },
    ],

    // 发送按钮
    sendButton: [
      '.chat-send-btn',
      '.send-btn',
      'button[class*="send"]',
      { type: 'text', tag: 'button', text: '发送' },
      { type: 'text', tag: 'span', text: '发送' },
      { type: 'xpath', expression: '//button[contains(text(), "发送")]' },
    ],

    // 聊天窗口容器（可能是弹窗）
    chatPanel: [
      '.chat-panel',
      '.chat-dialog',
      '.chat-window',
      '.im-panel',
      '[class*="chat-panel"]',
      '[class*="im-panel"]',
    ],
  },

  // ==================== 职位列表页 ====================
  jobList: {
    // 职位卡片列表容器
    listContainer: [
      '.job-list',
      '.search-job-result',
      '.recommend-list',
      '[class*="job-list"]',
      '[class*="result"] ul',
    ],

    // 单个职位卡片
    jobCards: [
      '.job-card-wrapper',
      '.job-card',
      '.job-list-item',
      'li[class*="job"]',
      '[class*="job-card"]',
    ],

    // 卡片中的职位名称
    jobCardTitle: [
      '.job-name a',
      '.job-title a',
      'a[ka*="job-card-title"]',
      '.job-info a:first-child',
      '[class*="job-name"] a',
      { type: 'xpath', expression: '//a[contains(@class, "job") and contains(@class, "name")]' },
    ],

    // 卡片中的公司名称
    jobCardCompany: [
      '.company-name a',
      '.company-text a',
      '.company-info a',
      '[class*="company"] a',
    ],

    // 卡片中的薪资
    jobCardSalary: [
      '.salary-text',
      '.job-salary',
      '.job-info .salary',
      '[class*="salary"]',
    ],

    // 卡片中的位置信息
    jobCardLocation: [
      '.job-area',
      '.job-location',
      '.location-text',
    ],

    // 卡片中的标签（技能要求等）
    jobCardTags: [
      '.tag-list .tag-item',
      '.job-card-tags span',
      '[class*="tag-item"]',
    ],
  },

  // ==================== 通用 ====================
  common: {
    // 登录状态检测
    loginIndicator: [
      '.user-avatar',
      '.header-login-btn',
      '.user-info',
      '.nav-user',
      '[class*="avatar"]',
    ],

    // 页面主体
    mainContent: [
      '#app',
      'main',
      '.main-content',
      '[role="main"]',
    ],

    // 弹窗/模态框
    modal: [
      '.boss-popup',
      '.modal',
      '.dialog',
      '[class*="popup"]',
      '[class*="modal"]',
      '[class*="dialog"]',
    ],
  },

  // ==================== 智联招聘 ====================
  zhaopin: {
    // 职位详情页
    jobDetail: {
      communicateButton: [
        'a[class*="apply"], a[class*="chat"], a[class*="communicate"]',
        { type: 'text', tag: 'a', text: '立即沟通' },
        { type: 'text', tag: 'button', text: '立即沟通' },
        { type: 'text', tag: 'a', text: '立即沟通' },
      ],
      positionName: [
        'h1[class*="title"], .position-title h1, .job-title h1, .job-name h1',
        '.position-info h1',
      ],
      companyName: [
        'a[class*="company"], .company-name a, .company-info a',
        '[class*="company-name"]',
      ],
      salary: [
        '.position-salary, .job-salary, [class*="salary"]',
        '.salary-text',
      ],
      jobDescription: [
        '.position-detail, .job-detail, .position-description',
        '[class*="description"], [class*="detail-content"]',
        '.position-content',
      ],
    },
    // 聊天页
    chat: {
      messageContainer: [
        '.chat-messages, .message-list, .chat-list, [class*="message"] > div',
      ],
      messageItems: [
        '.message-item, .chat-message, .msg-item, [class*="message-item"]',
      ],
      hrMessage: [
        '.message-item.hr, .chat-message--hr, .msg-receive, .message-left',
      ],
      userMessage: [
        '.message-item.user, .chat-message--self, .msg-send, .message-right',
      ],
      messageText: [
        '.message-content-text, .message-text, .msg-text, [class*="text"]',
      ],
      inputArea: [
        '.chat-input textarea, .chat-input div[contenteditable]',
        'textarea[class*="input"], textarea[class*="chat"]',
        { tag: 'textarea', role: 'textbox' },
      ],
      sendButton: [
        '.chat-send-btn, .send-btn, button[class*="send"]',
        { type: 'text', tag: 'button', text: '发送' },
      ],
      chatPanel: [
        '.chat-panel, .chat-dialog, .chat-window, .im-panel, [class*="chat-panel"]',
      ],
    },
    // 职位列表
    jobList: {
      jobCards: [
        '.position-card, .job-card, .position-item, [class*="job-card"]',
        '.positionlist-item, li[class*="position"]',
      ],
      jobCardTitle: [
        '.position-title a, .job-title a, .position-name a, [class*="title"] a',
      ],
      jobCardCompany: [
        '.company-name a, .company-info a, [class*="company"] a',
      ],
      jobCardSalary: [
        '.position-salary, .job-salary, [class*="salary"]',
      ],
    },
  },
};

/**
 * 在指定上下文中尝试所有选择器策略，找到第一个匹配的元素
 * @param {Array} selectorList - 选择器列表
 * @param {Element} context - 查找上下文
 * @returns {Element|null}
 */
export function findElement(selectorList, context = document) {
  for (const sel of selectorList) {
    try {
      if (typeof sel === 'string') {
        const el = context.querySelector(sel);
        if (el) return el;
      } else if (sel.type === 'xpath') {
        const result = document.evaluate(
          sel.expression, context, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        );
        if (result.singleNodeValue) return result.singleNodeValue;
      } else if (sel.type === 'text') {
        const tag = sel.tag || '*';
        const candidates = context.querySelectorAll(tag);
        for (const c of candidates) {
          if (c.textContent?.trim().includes(sel.text)) {
            return c;
          }
        }
      } else if (sel.role) {
        const el = context.querySelector(`[role="${sel.role}"]`);
        if (el) return el;
      } else if (sel.attribute) {
        const el = context.querySelector(`[${sel.attribute}]`);
        if (el) return el;
      }
    } catch {
      // 选择器无效，尝试下一个
      continue;
    }
  }
  return null;
}

/**
 * 在指定上下文中找到所有匹配的元素
 * @param {Array} selectorList
 * @param {Element} context
 * @returns {Element[]}
 */
export function findAllElements(selectorList, context = document) {
  for (const sel of selectorList) {
    try {
      if (typeof sel === 'string') {
        const els = context.querySelectorAll(sel);
        if (els.length > 0) return Array.from(els);
      } else if (sel.type === 'xpath') {
        const result = document.evaluate(
          sel.expression, context, null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
        );
        const els = [];
        for (let i = 0; i < result.snapshotLength; i++) {
          els.push(result.snapshotItem(i));
        }
        if (els.length > 0) return els;
      } else if (sel.type === 'text') {
        const tag = sel.tag || '*';
        const candidates = context.querySelectorAll(tag);
        const found = [];
        for (const c of candidates) {
          if (c.textContent?.trim().includes(sel.text)) {
            found.push(c);
          }
        }
        if (found.length > 0) return found;
      } else if (sel.role) {
        const els = context.querySelectorAll(`[role="${sel.role}"]`);
        if (els.length > 0) return Array.from(els);
      }
    } catch {
      continue;
    }
  }
  return [];
}
