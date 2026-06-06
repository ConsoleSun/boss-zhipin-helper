// ============================================================
// constants.js — 全局常量、默认值和配置
// ============================================================

// 域名白名单
export const DOMAINS = ['boss.cn', 'zhipin.com', 'zhaopin.cn', 'zhaopin.com'];

// IndexedDB 配置
export const DB_NAME = 'bossZhipinHelper';
export const DB_VERSION = 1;

export const STORE_NAMES = {
  APPLICATIONS: 'applications',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  TEMPLATES: 'templates',
  STATS_CACHE: 'stats_cache',
  SETTINGS: 'settings',
};

// chrome.storage key
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  FEATURE_FLAGS: 'feature_flags',
  SELECTOR_FAILURES: 'selector_failures',
};

// 默认功能开关
export const DEFAULT_FEATURE_FLAGS = {
  greetingInjection: true,
  quickReply: true,
  jobBadges: true,
  messageClassification: true,
  appTracking: true,
};

// 默认打招呼模板
export const DEFAULT_GREETING_TEMPLATES = [
  {
    id: 'builtin-greeting-1',
    name: '默认打招呼',
    content: '您好，我对贵公司发布的{{positionName}}职位很感兴趣。\n我是{{userName}}，有{{userSkills}}等方面的经验。\n希望能进一步沟通，谢谢！',
    category: 'greeting',
    isDefault: true,
    isBuiltin: true,
  },
  {
    id: 'builtin-greeting-2',
    name: '简洁版',
    content: '您好，看到贵司在招{{positionName}}，我的背景是{{userSkills}}，非常匹配，期待和您聊聊。',
    category: 'greeting',
    isDefault: false,
    isBuiltin: true,
  },
  {
    id: 'builtin-greeting-3',
    name: '详细版',
    content: '您好！我对{{companyName}}的{{positionName}}岗位非常感兴趣。\n\n我是{{userName}}，拥有{{userSkills}}的经验。\n看了职位描述后，觉得和我的背景非常匹配。\n\n期待与您进一步沟通，了解更多关于该岗位和团队的细节。谢谢！',
    category: 'greeting',
    isDefault: false,
    isBuiltin: true,
  },
];

// 默认快捷回复模板
export const DEFAULT_REPLY_TEMPLATES = [
  {
    id: 'builtin-reply-resume-1',
    name: '发送简历',
    content: '好的，这是我的简历，请您查收。如有进一步需要了解的信息，随时联系我。',
    category: 'quick_reply',
    subcategory: 'ask_resume',
    isBuiltin: true,
  },
  {
    id: 'builtin-reply-interview-1',
    name: '确认面试邀请',
    content: '感谢您的面试邀请！我对这个机会非常感兴趣。请问面试时间安排在什么时候？我好提前做准备。',
    category: 'quick_reply',
    subcategory: 'ask_interview',
    isBuiltin: true,
  },
  {
    id: 'builtin-reply-salary-1',
    name: '回复薪资期望',
    content: '您好，基于我的经验和市场行情，我期望的薪资范围是{{expectedSalary}}，具体可以详谈。',
    category: 'quick_reply',
    subcategory: 'ask_salary',
    isBuiltin: true,
  },
  {
    id: 'builtin-reply-other-1',
    name: '通用回复',
    content: '感谢您的回复，我对这个岗位很感兴趣，请问能否详细介绍一下职位情况和团队背景？',
    category: 'quick_reply',
    subcategory: 'other',
    isBuiltin: true,
  },
];

// 关键词分类规则（AI 不可用时的降级方案）
export const DEFAULT_KEYWORD_RULES = [
  {
    intent: 'ask_resume',
    keywords: ['简历', '发送简历', '发简历', '发我一份', '发下简历', '附上简历', '附件', '作品集', '作品'],
    matchMode: 'any',
  },
  {
    intent: 'ask_interview',
    keywords: ['面试', '面谈', '来面试', '面试时间', '方便面试', '约个时间', '见面聊', '到公司', '过来聊聊', '线下面试', '视频面试'],
    matchMode: 'any',
  },
  {
    intent: 'ask_salary',
    keywords: ['薪资', '薪资要求', '期望薪资', '薪水', '工资', '待遇', '期望多少', '薪资范围', '多少钱', '薪酬'],
    matchMode: 'any',
  },
  {
    intent: 'spam',
    keywords: ['兼职', '代理', '收费', '刷单', '在家可做', '日结', '押金', '保证金', '培训费', '加微信', '加QQ', '扫码'],
    matchMode: 'any',
  },
];

// 投递限制（24小时内）
export const DAILY_APPLY_LIMIT = 50;

// 页面类型枚举
export const PAGE_TYPES = {
  JOB_LIST: 'job_list',
  JOB_DETAIL: 'job_detail',
  CHAT: 'chat',
  CANDIDATE_HOME: 'home',
  OTHER: 'other',
};

// 会话和投递状态
export const STATUS = {
  APPLICATION: {
    SENT: 'sent',
    REPLIED: 'replied',
    INTERVIEW: 'interview',
    REJECTED: 'rejected',
    ARCHIVED: 'archived',
  },
  CONVERSATION: {
    ACTIVE: 'active',
    ARCHIVED: 'archived',
  },
};

// 用户信息默认值
export const DEFAULT_USER_PROFILE = {
  userName: '我',
  userSkills: '',
  expectedSalary: '',
};

// 统计时间范围
export const STATS_RANGE = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  LAST_7_DAYS: 'last7days',
  LAST_30_DAYS: 'last30days',
  ALL_TIME: 'alltime',
};

// 数据保留天数
export const DATA_RETENTION_DAYS = 180;

// Observer 防抖延迟（ms）
export const OBSERVER_DEBOUNCE = 300;

// 重试配置
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 100,
};
