// ============================================================
// options.js — 设置页逻辑
// 模板管理、快速回复管理、个人信息、关键词规则、数据导入导出
// ============================================================

import { MSG, buildMessage } from '../shared/message-protocol.js';
import { SOURCE } from '../shared/message-protocol.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadAllData();
});

// ==================== 导航 ====================

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;

      // 切换导航激活状态
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // 切换内容区
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      document.getElementById(`section-${section}`).classList.add('active');
    });
  });
}

// ==================== 数据加载 ====================

async function loadAllData() {
  await loadUserProfile();
  await loadStorageInfo();
}

async function sendMsg(type, payload = {}) {
  try {
    return await chrome.runtime.sendMessage(buildMessage(type, payload, SOURCE.OPTIONS));
  } catch (err) {
    console.error('Options send error:', type, err);
    return null;
  }
}

// ==================== 个人信息 ====================

async function loadUserProfile() {
  const result = await sendMsg(MSG.GET_SETTINGS);
  if (!result?.success) return;
  const settings = result.payload || {};

  // 如果已有简历数据，显示查看按钮
  await initResumeButton();

  document.getElementById('setting-userName').value = settings.userName || '';
  document.getElementById('setting-userSkills').value = settings.userSkills || '';
  document.getElementById('setting-userExperience').value = settings.userExperience || '';
  document.getElementById('setting-expectedSalary').value = settings.expectedSalary || '';
  document.getElementById('setting-deepseek-key').value = settings.deepseekApiKey || '';
  document.getElementById('setting-mimo-key').value = settings.mimoApiKey || '';
  document.getElementById('setting-ai-provider').value = settings.aiProvider || 'deepseek';
  document.getElementById('setting-reply-mode').value = settings.replyMode || 'professional';

  document.getElementById('btn-save-profile').onclick = async () => {
    await sendMsg(MSG.SAVE_SETTINGS, {
      userName: document.getElementById('setting-userName').value.trim(),
      userSkills: document.getElementById('setting-userSkills').value.trim(),
      userExperience: document.getElementById('setting-userExperience').value.trim(),
      expectedSalary: document.getElementById('setting-expectedSalary').value.trim(),
      deepseekApiKey: document.getElementById('setting-deepseek-key').value.trim(),
      mimoApiKey: document.getElementById('setting-mimo-key').value.trim(),
      aiProvider: document.getElementById('setting-ai-provider').value,
      replyMode: document.getElementById('setting-reply-mode').value,
    });
    alert('设置已保存！');
  };
}

// ==================== 简历上传 ====================

document.getElementById('btn-upload-resume').addEventListener('click', () => {
  document.getElementById('resume-file').click();
});

document.getElementById('resume-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await parseResume(file);
});

async function parseResume(file) {
  const status = document.getElementById('resume-status');
  status.textContent = '⏳ 解析 PDF...';

  try {
    // 1. 读取 PDF 文本
    const arrayBuf = await file.arrayBuffer();
    const text = await extractPdfText(arrayBuf);
    if (!text || text.length < 20) {
      status.textContent = '❌ PDF 解析失败或内容过少';
      return;
    }
    status.textContent = '✅ PDF解析完成（' + text.length + '字），AI提取中...';

    // 2. 获取 DeepSeek Key
    const settingsRes = await sendMsg(MSG.GET_SETTINGS);
    const provider = settingsRes?.payload?.aiProvider || 'deepseek';
    const apiKey = provider === 'mimo' ? settingsRes?.payload?.mimoApiKey : settingsRes?.payload?.deepseekApiKey;
    if (!apiKey) {
      status.textContent = '❌ 未配置 API Key，请先在下方填写';
      return;
    }

    // 3. 调用 DeepSeek 提取结构化信息
    const structured = await callDeepSeekForResume(text, apiKey, provider);
    if (!structured) {
      status.textContent = '❌ AI 提取失败';
      return;
    }

    // 4. 保存结构化简历数据
    await sendMsg(MSG.SAVE_SETTINGS, { resumeData: structured });

    // 5. 显示查看/编辑按钮
    const viewBtn = document.getElementById('btn-view-resume');
    viewBtn.style.display = 'inline-block';
    viewBtn.onclick = () => showResumeModal(structured);

    status.textContent = '✅ 解析完成！点击右侧按钮查看结果';
    setTimeout(() => { status.textContent = ''; }, 8000);
  } catch (err) {
    status.textContent = '❌ 解析失败: ' + (err.message || '未知错误');
    console.error('Resume parse error:', err);
  } finally {
    e.target.value = '';
  }
}

async function extractPdfText(arrayBuf) {
  // 动态加载本地 PDF.js
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/pdf.min.js');
      script.onload = resolve;
      script.onerror = () => reject(new Error('PDF.js 加载失败'));
      document.head.appendChild(script);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
  }

  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // 用换行符连接，保留文本结构
    const text = content.items.map(item => item.str).join(' ')
      .replace(/\s{2,}/g, '\n'); // 多空格→换行（简历排版特征）
    pages.push(text);
  }
  return pages.join('\n--- 分页 ---\n');
}

async function callDeepSeekForResume(resumeText, apiKey, provider = 'deepseek') {
  const text = resumeText.length > 8000 ? resumeText.substring(0, 8000) : resumeText;

  const endpoint = provider === 'mimo' ? 'https://api.xiaomimimo.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions';
  const model = provider === 'mimo' ? 'mimo-v2.5-pro' : 'deepseek-chat';

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `你是简历信息提取助手，帮助用户从简历中整理信息。请完整提取所有内容，按章节分类。返回严格JSON（不要markdown代码块）：

{
  "name": "姓名",
  "phone": "电话",
  "email": "邮箱",
  "education": [{ "school": "学校", "major": "专业", "degree": "学历", "time": "时间" }],
  "experience": [{ "company": "公司", "position": "职位", "time": "时间", "description": "工作内容" }],
  "projects": [{ "name": "项目名", "role": "角色", "description": "项目描述和技术栈" }],
  "skills": "所有技能",
  "certificates": "证书和获奖",
  "languages": "语言能力",
  "summary": "个人总结（100字）",
  "expectedSalary": "期望薪资（如无则空）"
}

规则：
- 简历中每个章节的内容都要提取，不要遗漏
- 数组字段（education/experience/projects）要列出每一条
- 技能、证书、语言等要合并同类项
- 找不到的字段填空字符串或空数组` },
        { role: 'user', content: text },
      ],
      temperature: 0.1, max_tokens: 1500,
    }),
  });

  if (!resp.ok) throw new Error('API请求失败: ' + resp.status);
  const data = await resp.json();
  let content = data?.choices?.[0]?.message?.content || '';

  // 尝试从 markdown 代码块中提取
  const codeMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) content = codeMatch[1];

  // 提取 JSON 对象
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[Resume] AI原始返回:', content.substring(0, 200));
    throw new Error('AI 返回格式异常');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (jsonErr) {
    // JSON 有语法错误时，尝试修复常见问题
    console.error('[Resume] JSON解析失败，尝试修复:', jsonErr.message);
    // 重新请求一次（简化格式）
    const retryResp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '从简历文本提取信息，只返回纯JSON，不要markdown。所有字段用字符串，不要数组。' },
          { role: 'user', content: text + '\n\n返回格式：{"name":"","phone":"","email":"","skills":"","experience":"","education":"","summary":"","expectedSalary":""}' },
        ],
        temperature: 0, max_tokens: 600,
      }),
    });
    if (!retryResp.ok) throw new Error('重试请求失败: ' + retryResp.status);
    const retryData = await retryResp.json();
    let retryContent = retryData?.choices?.[0]?.message?.content || '';
    const retryMatch = retryContent.match(/\{[\s\S]*\}/);
    if (!retryMatch) throw new Error('重试解析失败');
    parsed = JSON.parse(retryMatch[0]);
  }

  parsed.fullText = resumeText;
  return parsed;
}

function showResumeModal(data) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  // 分离 fullText，不放入 JSON 编辑器
  const { fullText = '', ...structuredData } = data;
  const jsonStr = JSON.stringify(structuredData, null, 2);
  const shortText = (fullText || '').substring(0, 500);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="width:700px;max-height:90vh;">
      <h3>📋 简历识别结果</h3>
      <p class="help-text">上部为结构化数据（可编辑），下部为PDF原始文本（仅供参考）。保存后 AI 对话将参考全部内容。</p>
      <label style="font-weight:600;font-size:13px;">📊 结构化数据（可编辑）</label>
      <textarea id="resume-json-editor" style="width:100%;height:220px;font-family:Consolas,monospace;font-size:12px;padding:10px;border:1px solid #d9d9d9;border-radius:6px;resize:vertical;">${jsonStr}</textarea>
      <label style="font-weight:600;font-size:13px;margin-top:12px;display:block;">📝 PDF 原始文本（仅供参考，共${(fullText || '').length}字）</label>
      <textarea readonly style="width:100%;height:150px;font-size:11px;padding:8px;border:1px solid #e8e8e8;border-radius:6px;background:#f9f9f9;color:#666;resize:vertical;">${shortText}...</textarea>
      <div class="modal-footer" style="margin-top:12px;">
        <button class="btn" id="modal-cancel-resume">取消</button>
        <button class="btn btn-primary" id="modal-save-resume">💾 保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('modal-cancel-resume').onclick = () => modal.remove();
  document.getElementById('modal-save-resume').onclick = async () => {
    try {
      const edited = JSON.parse(document.getElementById('resume-json-editor').value);
      // 保留原始文本
      edited.fullText = fullText;
      await sendMsg(MSG.SAVE_SETTINGS, { resumeData: edited });
      modal.remove();
      document.getElementById('resume-status').textContent = '✅ 简历数据已保存';
      setTimeout(() => { document.getElementById('resume-status').textContent = ''; }, 3000);
    } catch (e) {
      alert('JSON 格式错误: ' + e.message);
    }
  };
}

// 页面加载时也加载已保存的简历数据，显示查看按钮
async function initResumeButton() {
  const result = await sendMsg(MSG.GET_SETTINGS);
  if (result?.success && result.payload?.resumeData) {
    const btn = document.getElementById('btn-view-resume');
    btn.style.display = 'inline-block';
    btn.onclick = () => showResumeModal(result.payload.resumeData);
  }
}

// ==================== 数据管理 ====================

async function loadStorageInfo() {
  // Auto-save storage settings on change
  const saveStorage = async () => {
    const maxJobs = parseInt(document.getElementById('setting-max-jobs').value) || 30;
    const maxAiHistory = parseInt(document.getElementById('setting-max-ai-history').value) || 50;
    await sendMsg(MSG.SAVE_SETTINGS, {
      maxJobs: Math.max(5, Math.min(200, maxJobs)),
      maxAiHistory: Math.max(5, Math.min(500, maxAiHistory)),
    });
  };
  document.getElementById('setting-max-jobs').addEventListener('change', saveStorage);
  document.getElementById('setting-max-ai-history').addEventListener('change', saveStorage);
  // 加载存储设置
  const settingsRes = await sendMsg(MSG.GET_SETTINGS);
  if (settingsRes?.success) {
    const s = settingsRes.payload || {};
    document.getElementById('setting-max-jobs').value = s.maxJobs || 30;
    document.getElementById('setting-max-ai-history').value = s.maxAiHistory || 50;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usageMB = (estimate.usage / 1024 / 1024).toFixed(1);
    const quotaMB = (estimate.quota / 1024 / 1024).toFixed(0);
    document.getElementById('storage-info').innerHTML =
      `已使用 <strong>${usageMB} MB</strong> / 总量 ${quotaMB} MB`;
  } catch {
    document.getElementById('storage-info').textContent = '无法获取存储信息';
  }

  document.getElementById('btn-export').onclick = async () => {
    const result = await sendMsg(MSG.EXPORT_DATA);
    if (!result?.success || !result.payload) {
      alert('导出失败');
      return;
    }
    const blob = new Blob([JSON.stringify(result.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boss-helper-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById('btn-import').onclick = () => {
    document.getElementById('import-file').click();
  };

  document.getElementById('import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await sendMsg(MSG.IMPORT_DATA, { data });
      alert('数据导入成功！');
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
    e.target.value = '';
  };

  document.getElementById('btn-clear').onclick = async () => {
    if (!confirm('确定要清除所有投递记录和沟通记录吗？此操作不可恢复！')) return;
    if (!confirm('再次确认：删除所有数据？')) return;

    await sendMsg(MSG.DELETE_DATA, { store: 'applications' });
    await sendMsg(MSG.DELETE_DATA, { store: 'conversations' });
    await sendMsg(MSG.DELETE_DATA, { store: 'messages' });
    await sendMsg(MSG.DELETE_DATA, { store: 'templates' });
    await chrome.storage.local.remove(['bh_jobs', 'bh_ai_history']);
    alert('所有数据已清除');
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
