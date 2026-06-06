// ============================================================
// page-detector.js — 检测当前所在页面类型
// 策略：URL 模式匹配 → DOM 元素确认 → 返回 PageInfo
// ============================================================

import { PAGE_TYPES } from '../shared/constants.js';

/**
 * 页面信息结构
 * @typedef {Object} PageInfo
 * @property {string} pageType - PAGE_TYPES 中的一种
 * @property {string|null} jobId - 职位 ID（如果存在）
 * @property {string|null} conversationId - 会话 ID（如果在聊天页）
 * @property {string} url - 当前 URL
 * @property {number} detectedAt - 检测时间戳
 */

export class PageDetector {
  /**
   * 检测当前页面类型
   * @returns {PageInfo}
   */
  static detect() {
    const url = window.location.href;
    const pageType = this._detectByUrl(url);
    const jobId = this._extractJobId(url);
    const conversationId = this._extractConversationId(url);

    return {
      pageType,
      jobId,
      conversationId,
      url,
      detectedAt: Date.now(),
    };
  }

  /**
   * 通过 URL 模式匹配判断页面类型
   */
  static _detectByUrl(url) {
    const urlLower = url.toLowerCase();
    const isZhaopin = urlLower.includes('zhaopin.cn') || urlLower.includes('zhaopin.com');

    // 聊天页面: /chat/, /geek/chat/, /web/chat/, /im/
    if (/\/chat\//.test(urlLower) || /\/im\//.test(urlLower) || /\/geek\/chat/.test(urlLower)) {
      return PAGE_TYPES.CHAT;
    }

    // 职位详情: /job_detail/, /job-detail/, /position/detail/
    if (/\/job[_-]?detail\//.test(urlLower) || /\/position\/detail\//.test(urlLower)) {
      return PAGE_TYPES.JOB_DETAIL;
    }

    // 候选人首页: /geek/ (但排除 chat)
    if (/\/geek\//.test(urlLower) || /\/candidate\//.test(urlLower) || /\/web\/geek\//.test(urlLower)) {
      return PAGE_TYPES.CANDIDATE_HOME;
    }

    // 职位列表: 城市编码路径 /c101010000/, 搜索 /job/search, /job/list, /position/search
    if (/\/c\d+\//.test(urlLower) ||
        /\/job\/list/.test(urlLower) ||
        /\/job\/search/.test(urlLower) ||
        /\/position\/search/.test(urlLower) ||
        /\/search\//.test(urlLower)) {
      return PAGE_TYPES.JOB_LIST;
    }

    // 首页: 根路径
    if (urlLower.endsWith('boss.cn/') ||
        urlLower.endsWith('boss.cn') ||
        urlLower.endsWith('zhipin.com/') ||
        urlLower.endsWith('zhipin.com') ||
        urlLower.endsWith('zhaopin.cn/') ||
        urlLower.endsWith('zhaopin.cn') ||
        urlLower.endsWith('zhaopin.com/') ||
        urlLower.endsWith('zhaopin.com') ||
        /\/web\/job\/?$/.test(urlLower) ||
        /\/web\/position/.test(urlLower)) {
      return PAGE_TYPES.JOB_LIST;
    }

    return PAGE_TYPES.OTHER;
  }

  /**
   * 从当前页面提取职位 ID
   */
  static _extractJobId(url) {
    try {
      // URL 路径: /job_detail/xxx.html 或 /position/detail/xxx
      const pathMatch = url.match(/\/job[_-]?detail\/([A-Za-z0-9_-]+)/) ||
                        url.match(/\/position\/detail\/([A-Za-z0-9_-]+)/);
      if (pathMatch) return pathMatch[1];

      // Query 参数
      const urlObj = new URL(url);
      return urlObj.searchParams.get('jobId') ||
             urlObj.searchParams.get('positionId') ||
             urlObj.searchParams.get('lid') ||
             urlObj.searchParams.get('id') ||
             null;
    } catch {
      return null;
    }
  }

  /**
   * 从 URL 提取会话 ID
   */
  static _extractConversationId(url) {
    try {
      const pathMatch = url.match(/\/chat\/([A-Za-z0-9_-]+)/);
      if (pathMatch) return pathMatch[1];

      const urlObj = new URL(url);
      return urlObj.searchParams.get('chatId') ||
             urlObj.searchParams.get('conversationId') ||
             null;
    } catch {
      return null;
    }
  }

  // ==================== 便捷判断方法 ====================

  static isJobListPage() {
    return this.detect().pageType === PAGE_TYPES.JOB_LIST;
  }

  static isJobDetailPage() {
    return this.detect().pageType === PAGE_TYPES.JOB_DETAIL;
  }

  static isChatPage() {
    return this.detect().pageType === PAGE_TYPES.CHAT;
  }

  static isCandidateHomePage() {
    return this.detect().pageType === PAGE_TYPES.CANDIDATE_HOME;
  }

  /**
   * 等待页面中特定元素出现（用于 DOM 确认）
   * @param {Function} checkFn - 检查函数，返回 boolean
   * @param {number} timeout - 超时时间 ms
   * @returns {Promise<boolean>}
   */
  static async waitForElement(checkFn, timeout = 5000) {
    const startTime = Date.now();
    return new Promise(resolve => {
      const check = () => {
        if (checkFn()) {
          resolve(true);
          return;
        }
        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }
}
