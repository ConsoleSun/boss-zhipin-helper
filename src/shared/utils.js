// ============================================================
// utils.js — 通用工具函数
// ============================================================

/**
 * 防抖：在函数调用后等待 delay ms，期间重复调用则重新计时
 */
export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流：每 limit ms 最多执行一次
 */
export function throttle(fn, limit = 300) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

/**
 * 延迟等待
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带退避的重试操作
 */
export async function retryOperation(fn, maxRetries = 3, baseDelay = 100) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await sleep(Math.pow(2, attempt) * baseDelay);
    }
  }
}

/**
 * 判断 URL 是否属于 BOSS 直聘域名
 */
export function isBossDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes('boss.cn') || hostname.includes('zhipin.com') || hostname.includes('zhaopin');
  } catch {
    return false;
  }
}

/**
 * 从 URL 中提取职位 ID
 * URL pattern: /job_detail/{jobId}.html 或 ?jobId=xxx
 */
export function extractJobIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    // 尝试 /job_detail/xxx.html 模式
    const pathMatch = urlObj.pathname.match(/\/job_detail\/([A-Za-z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

    // 尝试 query 参数
    const jobId = urlObj.searchParams.get('jobId') || urlObj.searchParams.get('positionId');
    if (jobId) return jobId;

    return null;
  } catch {
    return null;
  }
}

/**
 * 从 DOM 元素中提取职位 ID
 */
export function extractJobIdFromElement(el) {
  if (!el) return null;
  // 尝试 data 属性
  const attrs = ['data-jobid', 'data-position-id', 'ka-position-id', 'data-id'];
  for (const attr of attrs) {
    const val = el.getAttribute?.(attr);
    if (val) return val;
  }
  // 尝试从 href 提取
  const link = el.closest?.('a[href]') || el.querySelector?.('a[href]');
  if (link) {
    return extractJobIdFromUrl(link.href);
  }
  return null;
}

/**
 * 从聊天页面 URL 提取会话 ID
 */
export function extractConversationIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/chat\/([A-Za-z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

    const cid = urlObj.searchParams.get('chatId') || urlObj.searchParams.get('conversationId');
    if (cid) return cid;

    return null;
  } catch {
    return null;
  }
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date) {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 格式化为 YYYY-MM-DD HH:mm:ss
 */
export function formatDateTime(date) {
  const datePart = formatDate(date);
  const dt = date instanceof Date ? date : new Date(date);
  const h = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  const s = String(dt.getSeconds()).padStart(2, '0');
  return `${datePart} ${h}:${min}:${s}`;
}

/**
 * 相对时间显示
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return formatDate(timestamp);
}

/**
 * HTML 转义
 */
export function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, c => map[c]);
}

/**
 * 生成 UUID v4
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 安全地从 DOM 获取文本内容
 */
export function safeTextContent(el, fallback = '') {
  return el?.textContent?.trim() || fallback;
}

/**
 * 判断是否在当天
 */
export function isToday(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

/**
 * 获取当天起始时间戳（00:00:00）
 */
export function getStartOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 获取当天结束时间戳（23:59:59）
 */
export function getEndOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * 获取 N 天前的起始时间戳
 */
export function getDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 设置 React 受控输入框的值（绕过 React 合成事件系统）
 * BOSS 直聘使用 React，直接设置 element.value 会被 React 覆盖
 */
export function setReactInputValue(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }
  // 触发 React 的合成事件系统
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * 在页面中使用 XPath 查找元素
 */
export function findByXPath(expression, context = document) {
  const result = document.evaluate(
    expression,
    context,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return result.singleNodeValue;
}

/**
 * 使用多种选择器策略查找元素
 * @param {Array<string|Object>} selectors - 选择器列表，按优先级排列
 * @param {Element} context - 查找上下文
 * @returns {Element|null}
 */
export function resolveSelector(selectors, context = document) {
  for (const sel of selectors) {
    try {
      if (typeof sel === 'string') {
        const el = context.querySelector(sel);
        if (el) return el;
      } else if (sel.type === 'xpath') {
        const el = findByXPath(sel.expression, context);
        if (el) return el;
      } else if (sel.type === 'text') {
        // 通过文本内容查找
        const tag = sel.tag || '*';
        const candidates = context.querySelectorAll(tag);
        for (const c of candidates) {
          if (c.textContent?.trim().includes(sel.text)) {
            return c;
          }
        }
      } else if (sel.attribute) {
        // 通过属性查找
        const el = context.querySelector(`[${sel.attribute}]`);
        if (el) return el;
      } else if (sel.role) {
        // 通过 role 查找
        const el = context.querySelector(`[role="${sel.role}"]`);
        if (el) return el;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 检查元素是否在视口中
 */
export function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * 向 service worker 发送消息（带重试）
 */
export async function sendToBackground(message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(Math.pow(2, attempt) * 100);
    }
  }
}

/**
 * 解析 DOM 变更中新增的元素
 */
export function getAddedElements(mutations) {
  const added = [];
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        added.push(node);
      }
    }
  }
  return added;
}
