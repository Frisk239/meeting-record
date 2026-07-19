/**
 * PROTOTYPE — Meeting Record MVP clickable SPA
 * Question: full product path under Claude UI — IA, gestures, tabs for build/acceptance.
 * Not production. State in memory (+ sessionStorage for auth demo).
 */
(function () {
  "use strict";

  const APP_NAME = "Meeting Record";
  const MAX_REC_SEC = 60 * 60;
  const HOLD_MS = 800;

  const SEED_MEETINGS = [
    {
      id: "m1",
      title: "2023级实习与毕业安排说明会",
      summary: "讲解实习要求、时间、材料及大四关键节点，强调实习重要性。",
      updatedAt: "2026-07-19T08:10:00",
      status: "ready",
      durationSec: 5153,
      minutes: {
        topic: "2023级实习与毕业安排说明会",
        time: "2026-07-19 08:10",
        place: "根据上下文未明确具体地点",
        participants: "美萍老师（学院说明）；辅导员（配合传达）；在场学生",
        goal: "明确实习规范、材料与关键节点，推动学生尽快落实实习与毕业安排。",
        topics: [
          {
            title: "1、实习要求与规范",
            sub: "实习时间与学分",
            bullets: [
              "实习有效时间从 07 月 01 日开始计算；三四月已开始的需自行与企业微调，学院不做过多考核。",
              "实习时长不少于 3 个月，对应 6 学分；中英合作班不少于 6 周；中日合作数字媒体专业执行 12 周标准。",
            ],
          },
          {
            title: "2、材料与节点",
            sub: "手册与校招",
            bullets: [
              "本科生实习手册电子版将发给辅导员转发年级群。",
              "学院会引进企业进校宣讲，校招陆续推进。",
            ],
          },
        ],
        dispute:
          "关于实习工资与就业薪资：美萍老师指出同等水平学生薪资从 13k 降至 7k，辅导员表示「7k 还不去，不知道大家在想什么」，并强调先就业再择业。",
        actions: [
          { who: "美萍老师", text: "将本科生实习手册电子版发给辅导员，由辅导员转发至年级群。" },
          { who: "辅导员", text: "将 2022 级实习相关材料作为参考发至年级群，并请岳松导协助摸排未落实单位的学生。" },
        ],
        timeline: [
          { t: "00:00", title: "开场与总时长预期", body: "说明距离毕业仍有时间窗口，鼓励主动投递。" },
          { t: "12:40", title: "学分与特殊专业", body: "明确 3 个月 / 6 学分及合作班差异。" },
          { t: "40:00", title: "薪资讨论", body: "多方对 7k–13k 区间表态，建议找准定位。" },
        ],
      },
      segments: [
        { spk: 0, t: "00:00", text: "一到失业也还有 334 个月的时间，可以供你去找找这个实习是吧？" },
        { spk: 0, t: "00:18", text: "好，那第一个你要争取实习机会，这东西不会掉下来，只有你自己主动的去投各种简历。" },
        { spk: 1, t: "01:05", text: "我们也会引进很多的企业来学校里面做宣讲，校招会陆陆续续推进。" },
        { spk: 0, t: "12:40", text: "实习时长要求不少于 3 个月，对应 6 个学分。中英合作班因下学期仍有课程，不少于 6 周即可。" },
        { spk: 1, t: "40:12", text: "7k 还不去，不知道大家在想什么。先就业再择业，在当前环境下很重要。" },
      ],
      insights: null,
      qa: [
        { role: "ai", text: "你可以问我这场会的待办、争议或某段原话。回答会基于本场纪要与原文（原型为模拟）。" },
      ],
    },
    {
      id: "m2",
      title: "新录音 07-18 16:26",
      summary: "",
      updatedAt: "2026-07-18T16:26:00",
      status: "transcribing",
      durationSec: 320,
      minutes: null,
      segments: [],
      insights: null,
      qa: [],
    },
    {
      id: "m3",
      title: "【示例】市场冲刺周例会",
      summary: "公司年底业绩仅完成一半，需解决系统崩溃、供应链断货等问题。",
      updatedAt: "2026-04-08T16:26:00",
      status: "ready",
      durationSec: 2400,
      minutes: {
        topic: "市场冲刺周例会",
        time: "2026-04-08 16:26",
        place: "线上",
        participants: "市场负责人；产研代表",
        goal: "对齐冲刺目标与阻塞项。",
        topics: [{ title: "1、业绩与阻塞", sub: "现状", bullets: ["业绩完成约一半", "系统与供应链为主要风险"] }],
        dispute: "",
        actions: [{ who: "产研", text: "本周给出系统稳定性修复排期。" }],
        timeline: [{ t: "00:00", title: "开场", body: "回顾数字与缺口。" }],
      },
      segments: [
        { spk: 0, t: "00:00", text: "我们先看一下本周漏斗和系统故障次数。" },
        { spk: 1, t: "05:20", text: "供应链那边断货 SKU 还在增加，需要市场侧同步客户预期。" },
      ],
      insights: null,
      qa: [],
    },
  ];

  const state = {
    user: null,
    allowRegister: true,
    meetings: structuredClone(SEED_MEETINGS),
    route: { name: "login", params: {} },
    recording: { active: false, paused: false, sec: 0, hold: 0, timer: null },
    recView: "time",
    toastTimer: null,
    llm: { base_url: "https://api.openai.com/v1", model_id: "gpt-4o-mini", api_key: "" },
  };

  try {
    const saved = sessionStorage.getItem("mr_proto_user");
    if (saved) state.user = JSON.parse(saved);
    const llm = sessionStorage.getItem("mr_proto_llm");
    if (llm) state.llm = { ...state.llm, ...JSON.parse(llm) };
  } catch (_) {}

  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $("#app");

  function toast(msg) {
    let t = $(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function fmtDur(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return h === "00" ? `${m}:${r}` : `${h}:${m}:${r}`;
  }

  function fmtWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function statusChip(st) {
    if (st === "ready") return `<span class="chip ok">纪要就绪</span>`;
    if (st === "transcribing") return `<span class="chip run">转写中</span>`;
    if (st === "queued") return `<span class="chip queue">排队中</span>`;
    if (st === "minutes") return `<span class="chip run">生成纪要中</span>`;
    if (st === "failed") return `<span class="chip fail">失败</span>`;
    return `<span class="chip">${st}</span>`;
  }

  function requireAuth() {
    if (!state.user) {
      navigate("#/login");
      return false;
    }
    return true;
  }

  function navigate(hash) {
    if (location.hash !== hash) location.hash = hash;
    else routeFromHash();
  }

  function parseHash() {
    const raw = (location.hash || "#/login").replace(/^#/, "") || "/login";
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "meeting" && parts[1] && parts[2] === "ask") {
      return { name: "ask", params: { id: parts[1] } };
    }
    if (parts[0] === "meeting" && parts[1]) {
      const tab = new URLSearchParams(qs || "").get("tab") || "minutes";
      return { name: "meeting", params: { id: parts[1], tab } };
    }
    const name = parts[0] || "login";
    return { name, params: {} };
  }

  function routeFromHash() {
    state.route = parseHash();
    render();
  }

  function setUser(user) {
    state.user = user;
    if (user) sessionStorage.setItem("mr_proto_user", JSON.stringify(user));
    else sessionStorage.removeItem("mr_proto_user");
  }

  function findMeeting(id) {
    return state.meetings.find((m) => m.id === id);
  }

  function navActive(key) {
    const n = state.route.name;
    if (key === "home") return n === "home" ? "active" : "";
    if (key === "record") return n === "record" ? "active" : "";
    if (key === "settings") return n === "settings" ? "active" : "";
    if (key === "meeting") return n === "meeting" || n === "ask" ? "active" : "";
    return "";
  }

  function userLabel() {
    if (!state.user) return "";
    const e = state.user.email || "";
    const name = state.user.displayName || e.split("@")[0] || "用户";
    return name;
  }

  function desktopNav() {
    if (!state.user) return "";
    return `
      <nav class="nav-desktop" aria-label="主导航">
        <div class="nav-brand">${APP_NAME}</div>
        <div class="nav-links">
          <button type="button" class="nav-link ${navActive("home")}" data-nav="#/home">笔记</button>
          <button type="button" class="nav-link ${navActive("record")}" data-nav="#/record">录音</button>
          <button type="button" class="nav-link ${navActive("settings")}" data-nav="#/settings">我的</button>
        </div>
        <button type="button" class="nav-user" data-nav="#/settings" title="${escapeAttr(state.user.email)}">
          <span class="nav-avatar">${escapeHtml(userLabel().slice(0, 1).toUpperCase())}</span>
          <span class="nav-username">${escapeHtml(userLabel())}</span>
        </button>
      </nav>`;
  }

  function mobileNav() {
    if (!state.user) return "";
    // Hide bottom nav on immersive record page for focus (still reachable via desktop top)
    if (state.route.name === "record") return "";
    return `
      <nav class="nav-mobile" aria-label="底部导航">
        <button type="button" class="nav-item ${navActive("home")}" data-nav="#/home">
          <span class="ico">☰</span><span>笔记</span>
        </button>
        <button type="button" class="nav-item rec-item ${navActive("record")}" data-nav="#/record">
          <span class="ico-wrap">●</span><span class="label">录音</span>
        </button>
        <button type="button" class="nav-item ${navActive("settings")}" data-nav="#/settings">
          <span class="ico">☺</span><span>我的</span>
        </button>
      </nav>`;
  }

  /** Hidden file input for audio import — real upload entry */
  function fileImportInput(id = "fileImport") {
    return `<input type="file" id="${id}" class="sr-only" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm" />`;
  }

  function shell(inner, opts = {}) {
    const authed = !!state.user && !opts.authOnly;
    const showMobileNav = authed && state.route.name !== "record" && state.route.name !== "login" && state.route.name !== "register";
    return `
      <div class="proto-banner">PROTOTYPE · 非生产 · Claude 气质 · 响应式导航 · <strong>${APP_NAME}</strong></div>
      <div class="app-frame ${showMobileNav ? "has-nav-mobile" : ""}">
        ${authed ? desktopNav() : ""}
        <div class="shell">${inner}</div>
        ${showMobileNav ? mobileNav() : ""}
      </div>
      ${opts.hideToast ? "" : '<div class="toast"></div>'}
    `;
  }

  function iconBack() {
    return `<button class="icon-btn" type="button" data-nav="-1" aria-label="返回">←</button>`;
  }

  function renderLogin() {
    return shell(
      `
      <div class="page no-tab">
        <div class="auth-hero">
          <h2>${APP_NAME}</h2>
          <p>自托管会议纪要 · CPU 转写 · LLM 总结</p>
        </div>
        <div class="auth-card">
          <div class="field">
            <label>邮箱 / 用户名</label>
            <input id="loginId" type="text" placeholder="demo@local" value="demo@local" autocomplete="username" />
          </div>
          <div class="field">
            <label>密码</label>
            <input id="loginPw" type="password" placeholder="任意密码（原型）" value="demo" autocomplete="current-password" />
          </div>
          <button class="btn btn-primary" type="button" id="btnLogin">登录</button>
          <button class="btn btn-ghost" type="button" id="btnDemo" style="margin-top:10px">演示进入</button>
          <div class="link-row">
            还没有账号？
            <a href="#/register" data-link>注册</a>
          </div>
        </div>
      </div>
    `,
      { authOnly: true }
    );
  }

  function renderRegister() {
    /* allowRegister: 生产由后端决定；原型默认 true 仅模拟「开放注册」态 */
    return shell(
      `
      <div class="page no-tab">
        <div class="topbar">${iconBack()}<h1>注册</h1></div>
        <div class="content">
          <div class="auth-card" style="margin:0">
            ${
              state.allowRegister
                ? `
              <div class="field"><label>邮箱</label><input id="regEmail" type="email" placeholder="you@example.com" /></div>
              <div class="field"><label>密码</label><input id="regPw" type="password" placeholder="至少 6 位（原型不校验强度）" /></div>
              <button class="btn btn-primary" type="button" id="btnReg">创建账号</button>
              <div class="link-row">已有账号？<a href="#/login" data-link>登录</a></div>
            `
                : `
              <p style="margin:0;color:var(--muted);font-size:14px">服务端未开放注册。请联系管理员创建账号。</p>
              <button class="btn btn-ghost" type="button" data-nav="#/login" style="margin-top:16px">返回登录</button>
            `
            }
          </div>
        </div>
      </div>
    `,
      { authOnly: true }
    );
  }

  function renderHome() {
    if (!requireAuth()) return "";
    const cards = state.meetings
      .slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map(
        (m) => `
        <button type="button" class="meeting-card" data-open="${m.id}">
          <div class="title">${escapeHtml(m.title)}</div>
          ${m.summary ? `<p class="summary">${escapeHtml(m.summary)}</p>` : `<p class="summary" style="color:var(--muted-soft)">暂无摘要</p>`}
          <div class="meta">
            <span>${fmtWhen(m.updatedAt)}</span>
            <span>·</span>
            <span>${fmtDur(m.durationSec || 0)}</span>
            ${statusChip(m.status)}
          </div>
        </button>
      `
      )
      .join("");

    return shell(`
      <div class="page with-mobile-nav">
        <div class="topbar">
          <div class="brand">${APP_NAME}</div>
          <button class="nav-user-chip" type="button" data-nav="#/settings" title="${escapeAttr(state.user.email)}">
            <span class="nav-avatar sm">${escapeHtml(userLabel().slice(0, 1).toUpperCase())}</span>
            <span class="nav-username">${escapeHtml(userLabel())}</span>
          </button>
        </div>
        <div class="content content-desktop-pad">
          <div class="list-header-row">
            <div class="list-tools">
              <span class="chip">我的笔记</span>
              <span class="chip">${state.meetings.length} 条</span>
            </div>
            <label class="btn btn-ghost btn-sm import-label" for="fileImportHome">导入音频</label>
            ${fileImportInput("fileImportHome")}
          </div>
          <p class="list-hint">现场录音请点底部/导航「录音」；已有文件请用「导入音频」。</p>
          <div class="home-grid">
            ${cards || `<p style="color:var(--muted)">还没有笔记。用「录音」录一段，或「导入音频」上传文件。</p>`}
          </div>
        </div>
      </div>
    `);
  }

  function renderRecord() {
    if (!requireAuth()) return "";
    const r = state.recording;
    return shell(`
      <div class="page no-tab">
        <div class="topbar">
          ${iconBack()}
          <h1>新录音 ${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</h1>
        </div>
        <div class="record-screen">
          <div class="record-status">${r.active ? (r.paused ? "已暂停" : "录音中") : "准备录音"}</div>
          <div class="record-timer" id="recTimer">${fmtDur(r.sec)}</div>
          <div class="record-cap">录音时长上限为 ${MAX_REC_SEC / 60} 分钟（MAX_RECORDING_MINUTES）</div>
          <div class="wave ${r.paused || !r.active ? "paused" : ""}" id="wave" aria-hidden="true">
            ${Array.from({ length: 9 }, () => "<span></span>").join("")}
          </div>
          <div class="record-actions">
            <button type="button" class="rec-round" id="btnDiscard" title="丢弃">✕</button>
            <button type="button" class="rec-main" id="btnHoldEnd" title="长按结束">
              ${r.active ? (r.paused ? "▶" : "❚❚") : "●"}
            </button>
            <button type="button" class="rec-round" id="btnPause" title="暂停/继续">${r.paused ? "▶" : "Ⅱ"}</button>
          </div>
          <p class="hold-hint" id="holdHint">点击中间开始 · <strong>长按结束并上传</strong>（约 0.8 秒）</p>
        </div>
      </div>
    `);
  }

  function renderMeeting() {
    if (!requireAuth()) return "";
    const m = findMeeting(state.route.params.id);
    if (!m) {
      return shell(`<div class="page no-tab"><div class="content"><p>未找到会议</p><button class="btn btn-primary" data-nav="#/home">回首页</button></div></div>`);
    }
    const tab = state.route.params.tab || "minutes";
    let body = "";
    if (tab === "minutes") body = viewMinutes(m);
    else if (tab === "transcript") body = viewTranscript(m);
    else body = viewInsights(m);

    return shell(`
      <div class="page with-mobile-nav" style="padding-bottom:${tab === "minutes" && m.status === "ready" ? "calc(100px + var(--safe-bottom))" : ""}">
        <div class="topbar">
          ${iconBack()}
          <h1>${escapeHtml(m.title)}</h1>
          <button class="icon-btn" type="button" data-export="${m.id}" title="导出">⇩</button>
        </div>
        <div class="tabs">
          <button type="button" class="tab ${tab === "minutes" ? "active" : ""}" data-tab="minutes">纪要</button>
          <button type="button" class="tab ${tab === "transcript" ? "active" : ""}" data-tab="transcript">原文</button>
          <button type="button" class="tab ${tab === "insights" ? "active" : ""}" data-tab="insights">外脑</button>
        </div>
        ${jobBanner(m)}
        <div class="content content-desktop-pad">${body}</div>
        ${
          tab === "minutes" && m.status === "ready"
            ? `<button type="button" class="ask-fab" data-nav="#/meeting/${m.id}/ask">💬 追问</button>`
            : ""
        }
      </div>
    `);
  }

  function jobBanner(m) {
    if (m.status === "transcribing" || m.status === "queued" || m.status === "minutes") {
      const label =
        m.status === "queued" ? "排队等待 CPU 转写…" : m.status === "minutes" ? "转写完成，正在生成纪要…" : "转写 + 说话人分离进行中…";
      return `<div class="job-banner"><span class="dot"></span><span>${label}</span></div>`;
    }
    if (m.status === "failed") return `<div class="job-banner fail"><span class="dot"></span><span>任务失败（原型可重试）</span></div>`;
    return "";
  }

  function viewMinutes(m) {
    if (!m.minutes) {
      return `<p style="color:var(--muted);font-size:14px;text-align:center;padding:40px 12px">纪要尚未生成。转写成功后将自动生成（Auto Minutes）。</p>`;
    }
    const min = m.minutes;
    return `
      <div class="minutes-header">
        <h2>纪要</h2>
        <div class="kv">
          <div><dt>会议主题</dt><dd contenteditable="true">${escapeHtml(min.topic)}</dd></div>
          <div><dt>会议时间</dt><dd>${escapeHtml(min.time)}</dd></div>
          <div><dt>会议地点</dt><dd contenteditable="true">${escapeHtml(min.place || "—")}</dd></div>
          <div><dt>参与主体</dt><dd contenteditable="true">${escapeHtml(min.participants)}</dd></div>
          <div><dt>核心目标</dt><dd contenteditable="true">${escapeHtml(min.goal)}</dd></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">关键议题内容</div>
        ${min.topics
          .map(
            (t) => `
          <div class="topic">
            <h3>${escapeHtml(t.title)}</h3>
            <h4>${escapeHtml(t.sub || "")}</h4>
            <ul>${t.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
          </div>`
          )
          .join("")}
      </div>
      ${
        min.dispute
          ? `<div class="section"><div class="section-title">争议点</div><blockquote class="quote">${escapeHtml(min.dispute)}</blockquote></div>`
          : ""
      }
      <div class="section">
        <div class="section-title">待办事项</div>
        <ul class="action-list">
          ${min.actions.map((a) => `<li><span class="who">${escapeHtml(a.who)}：</span>${escapeHtml(a.text)}</li>`).join("")}
        </ul>
      </div>
      <div class="section">
        <div class="section-title">时间轴内容回顾</div>
        ${min.timeline
          .map(
            (x) => `
          <div class="timeline-item">
            <div class="t">${escapeHtml(x.t)}</div>
            <div class="b"><strong>${escapeHtml(x.title)}</strong>${escapeHtml(x.body)}</div>
          </div>`
          )
          .join("")}
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-sm" data-regen="${m.id}">重新生成纪要</button>
        <button type="button" class="btn btn-ghost btn-sm" data-export="${m.id}">导出 MD / PDF</button>
      </div>
    `;
  }

  function viewTranscript(m) {
    const segs = m.segments || [];
    const filter = state.recView;
    let list = segs;
    if (filter === "spk0") list = segs.filter((s) => s.spk === 0);
    if (filter === "spk1") list = segs.filter((s) => s.spk === 1);

    return `
      <div class="player">
        <button type="button" class="icon-btn" id="btnPlayFake" aria-label="播放">▶</button>
        <span class="time">00:00</span>
        <div class="bar"><i></i></div>
        <span class="time">${fmtDur(m.durationSec || 0)}</span>
        <button type="button" class="chip" id="btnSpeed">1x</button>
      </div>
      <div class="seg-filters">
        <button type="button" class="${filter === "time" ? "active" : ""}" data-recview="time">按时间</button>
        <button type="button" class="${filter === "spk0" ? "active" : ""}" data-recview="spk0">发言人 0</button>
        <button type="button" class="${filter === "spk1" ? "active" : ""}" data-recview="spk1">发言人 1</button>
      </div>
      ${
        list.length
          ? list
              .map(
                (s) => `
          <div class="seg">
            <div class="who">发言人 ${s.spk}<span>${escapeHtml(s.t)}</span></div>
            <div class="txt">${escapeHtml(s.text)}</div>
          </div>`
              )
              .join("")
          : `<p style="color:var(--muted);font-size:14px">暂无原文。转写完成后将显示带说话人标签的分段。</p>`
      }
      <div class="bottom-actions">
        <label class="btn btn-ghost import-label" for="fileImportMeeting">导入音频</label>
        ${fileImportInput("fileImportMeeting")}
        <button type="button" class="btn btn-primary" id="btnAppendRec">追加录音</button>
      </div>
    `;
  }

  function viewInsights(m) {
    if (!m.insights) {
      return `
        <div class="empty-insights">
          <p>外脑不会在转写后自动生成。<br/>需要时点击下方按钮显式生成（仍走 Context Pack + LLM）。</p>
          <button type="button" class="btn btn-primary btn-sm" data-gen-insights="${m.id}" ${m.status !== "ready" ? "disabled" : ""}>生成外脑</button>
        </div>`;
    }
    return `
      <div class="section">
        <div class="section-title">逻辑</div>
        <p style="font-size:14px;margin:0 0 12px">${escapeHtml(m.insights.logic)}</p>
        <div class="section-title">核心洞察</div>
        <p style="font-size:14px;margin:0 0 12px">${escapeHtml(m.insights.insight)}</p>
        <p class="hint" style="font-size:12px;color:var(--muted-soft)">原型静态文案 · 非自动灌屏</p>
        <button type="button" class="btn btn-ghost btn-sm" data-gen-insights="${m.id}" style="margin-top:12px">重新生成</button>
      </div>`;
  }

  function renderAsk() {
    if (!requireAuth()) return "";
    const m = findMeeting(state.route.params.id);
    if (!m) return shell(`<div class="page no-tab"><div class="content">未找到会议</div></div>`);
    const bubbles = (m.qa || [])
      .map((q) => `<div class="bubble ${q.role === "user" ? "user" : "ai"}">${escapeHtml(q.text)}</div>`)
      .join("");
    return shell(`
      <div class="page with-mobile-nav">
        <div class="topbar">
          <button class="icon-btn" type="button" data-nav="#/meeting/${m.id}?tab=minutes">←</button>
          <h1>追问 · ${escapeHtml(m.title)}</h1>
        </div>
        <div class="content content-desktop-pad">
          <p style="font-size:12px;color:var(--muted);margin:0 0 12px">纪要子页 · 基于本场 Transcript / Minutes（Context Pack）· 非全局闲聊</p>
          <div class="chat" id="chat">${bubbles}</div>
          <div class="chat-input">
            <input id="askInput" type="text" placeholder="例如：待办有哪些？薪资争议是什么？" />
            <button type="button" id="btnAskSend">发送</button>
          </div>
        </div>
      </div>
    `);
  }

  function renderSettings() {
    if (!requireAuth()) return "";
    const k = state.llm.api_key;
    const masked = k ? "•".repeat(Math.min(12, k.length)) + k.slice(-4) : "";
    const dn = state.user.displayName || userLabel();
    return shell(`
      <div class="page with-mobile-nav">
        <div class="topbar">${iconBack()}<h1>我的</h1></div>
        <div class="content content-desktop-pad">
          <div class="settings-card profile-card">
            <div class="profile-row">
              <span class="nav-avatar lg">${escapeHtml(userLabel().slice(0, 1).toUpperCase())}</span>
              <div>
                <div class="profile-name">${escapeHtml(dn)}</div>
                <div class="profile-email">${escapeHtml(state.user.email)}</div>
              </div>
            </div>
            <h3 style="margin-top:18px">个人中心</h3>
            <div class="field">
              <label>显示名称</label>
              <input id="profileName" type="text" value="${escapeAttr(dn)}" placeholder="怎么称呼你" />
            </div>
            <div class="field">
              <label>账号</label>
              <input type="text" value="${escapeAttr(state.user.email)}" disabled />
              <div class="hint">登录邮箱/用户名（原型不可改）</div>
            </div>
            <div class="field">
              <label>产品显示名（只读说明）</label>
              <input type="text" value="${escapeAttr(APP_NAME)}" disabled />
              <div class="hint">部署可用 APP_NAME 配置，非用户个人项</div>
            </div>
            <div class="btn-row">
              <button class="btn btn-primary btn-sm" type="button" id="btnSaveProfile">保存资料</button>
              <button class="btn btn-danger btn-sm" type="button" id="btnLogout">退出登录</button>
            </div>
          </div>
          <div class="settings-card">
            <h3>LLM · OpenAI Chat Completions</h3>
            <div class="field"><label>base_url</label><input id="llmBase" value="${escapeAttr(state.llm.base_url)}" /></div>
            <div class="field"><label>model_id</label><input id="llmModel" value="${escapeAttr(state.llm.model_id)}" /></div>
            <div class="field">
              <label>api_key</label>
              <input id="llmKey" type="password" placeholder="${masked || "sk-…"}" value="" />
              <div class="hint">原型仅存 sessionStorage · 生产需安全存储且勿写日志</div>
            </div>
            <button class="btn btn-primary" type="button" id="btnSaveLlm">保存 LLM 配置</button>
          </div>
        </div>
      </div>
    `);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function render() {
    const r = state.route.name;
    let html = "";
    if (r === "login") html = renderLogin();
    else if (r === "register") html = renderRegister();
    else if (r === "home") html = renderHome();
    else if (r === "record") html = renderRecord();
    else if (r === "meeting") html = renderMeeting();
    else if (r === "ask") html = renderAsk();
    else if (r === "settings") html = renderSettings();
    else html = renderLogin();
    app.innerHTML = html;
    bind();
  }

  function bind() {
    app.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => {
        const v = el.getAttribute("data-nav");
        if (v === "-1") history.back();
        else navigate(v);
      });
    });
    app.querySelectorAll("[data-link]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        navigate(el.getAttribute("href"));
      });
    });

    $("#btnLogin")?.addEventListener("click", () => {
      const id = $("#loginId")?.value?.trim() || "demo@local";
      setUser({ email: id });
      toast("已登录");
      navigate("#/home");
    });
    $("#btnDemo")?.addEventListener("click", () => {
      setUser({ email: "demo@local" });
      navigate("#/home");
    });
    $("#btnReg")?.addEventListener("click", () => {
      if (!state.allowRegister) return;
      const email = $("#regEmail")?.value?.trim();
      if (!email) return toast("请填写邮箱");
      setUser({ email });
      toast("注册成功（原型）");
      navigate("#/home");
    });

    app.querySelectorAll("[data-open]").forEach((el) => {
      el.addEventListener("click", () => navigate(`#/meeting/${el.getAttribute("data-open")}?tab=minutes`));
    });
    function wireFileImport(inputId, existingMeetingId) {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener("change", () => {
        const f = input.files && input.files[0];
        if (!f) return;
        mockImport(existingMeetingId, f.name);
        input.value = "";
      });
    }
    wireFileImport("fileImportHome");
    wireFileImport("fileImportMeeting", state.route.params.id);

    // recording page
    $("#btnHoldEnd")?.addEventListener("click", () => {
      if (!state.recording.active) startRecording();
    });
    bindHoldEnd();
    $("#btnPause")?.addEventListener("click", () => {
      if (!state.recording.active) return;
      state.recording.paused = !state.recording.paused;
      render();
    });
    $("#btnDiscard")?.addEventListener("click", () => {
      stopRecordingTimers();
      state.recording = { active: false, paused: false, sec: 0, hold: 0, timer: null };
      toast("已丢弃录音");
      navigate("#/home");
    });

    // meeting tabs
    app.querySelectorAll("[data-tab]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = state.route.params.id;
        navigate(`#/meeting/${id}?tab=${el.getAttribute("data-tab")}`);
      });
    });
    app.querySelectorAll("[data-recview]").forEach((el) => {
      el.addEventListener("click", () => {
        state.recView = el.getAttribute("data-recview");
        render();
      });
    });
    $("#btnAppendRec")?.addEventListener("click", () => {
      toast("追加录音：进入录音页（结束后合并到本会，原型简化为新建）");
      navigate("#/record");
    });
    app.querySelectorAll("[data-export]").forEach((el) => {
      el.addEventListener("click", () => {
        toast("原型：将导出 Markdown + PDF（真实下载未接）");
      });
    });
    app.querySelectorAll("[data-regen]").forEach((el) => {
      el.addEventListener("click", () => {
        toast("重新生成纪要（原型：文案不变，表示已触发 LLM）");
      });
    });
    app.querySelectorAll("[data-gen-insights]").forEach((el) => {
      el.addEventListener("click", () => {
        const m = findMeeting(el.getAttribute("data-gen-insights"));
        if (!m || m.status !== "ready") return;
        m.insights = {
          logic: "本场先说明实习规范与学分，再讨论就业心态与材料发放，形成「要求 → 争议 → 行动」结构。",
          insight: "在预期管理上，把「薪资落差」与「先就业」放在同一语境，避免学生只听到指责。",
        };
        toast("外脑已生成（显式触发）");
        render();
      });
    });

    $("#btnAskSend")?.addEventListener("click", sendAsk);
    $("#askInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendAsk();
    });

    $("#btnSaveProfile")?.addEventListener("click", () => {
      const name = $("#profileName")?.value?.trim();
      if (!name) return toast("请填写显示名称");
      state.user = { ...state.user, displayName: name };
      sessionStorage.setItem("mr_proto_user", JSON.stringify(state.user));
      toast("资料已保存");
      render();
    });
    $("#btnLogout")?.addEventListener("click", () => {
      setUser(null);
      navigate("#/login");
    });
    $("#btnSaveLlm")?.addEventListener("click", () => {
      state.llm.base_url = $("#llmBase")?.value?.trim() || state.llm.base_url;
      state.llm.model_id = $("#llmModel")?.value?.trim() || state.llm.model_id;
      const key = $("#llmKey")?.value;
      if (key) state.llm.api_key = key;
      sessionStorage.setItem("mr_proto_llm", JSON.stringify(state.llm));
      toast("LLM 配置已保存（sessionStorage）");
    });
  }

  function sendAsk() {
    const m = findMeeting(state.route.params.id);
    const input = $("#askInput");
    const text = input?.value?.trim();
    if (!m || !text) return;
    m.qa = m.qa || [];
    m.qa.push({ role: "user", text });
    const reply = mockAnswer(m, text);
    m.qa.push({ role: "ai", text: reply });
    input.value = "";
    render();
  }

  function mockAnswer(m, q) {
    const min = m.minutes;
    if (/待办|action/i.test(q) && min?.actions?.length) {
      return "本场待办：\n" + min.actions.map((a) => `· ${a.who}：${a.text}`).join("\n");
    }
    if (/争议|薪资|工资/i.test(q) && min?.dispute) {
      return "纪要中的争议点：\n" + min.dispute;
    }
    if (/谁|发言人|speaker/i.test(q)) {
      return "原文中有发言人 0 / 1 等标签（声学 diarization）。真名映射为 P1。";
    }
    return `（原型模拟 Context Pack）已结合本场纪要头「${min?.topic || m.title}」与原文片段作答：${q}\n\n生产环境将调用 Chat Completions，Pinned Facts（待办/争议等）全量进入上下文。`;
  }

  function startRecording() {
    state.recording.active = true;
    state.recording.paused = false;
    if (state.recording.timer) clearInterval(state.recording.timer);
    state.recording.timer = setInterval(() => {
      if (!state.recording.active || state.recording.paused) return;
      state.recording.sec += 1;
      if (state.recording.sec >= MAX_REC_SEC) {
        finishRecording(true);
        return;
      }
      const t = $("#recTimer");
      if (t) t.textContent = fmtDur(state.recording.sec);
    }, 1000);
    render();
  }

  function stopRecordingTimers() {
    if (state.recording.timer) clearInterval(state.recording.timer);
    state.recording.timer = null;
  }

  function bindHoldEnd() {
    const btn = $("#btnHoldEnd");
    if (!btn) return;
    let holdTimer = null;
    let holding = false;

    const clearHold = () => {
      holding = false;
      btn.classList.remove("hold-progress");
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      const hint = $("#holdHint");
      if (hint && state.recording.active) {
        hint.textContent = "长按结束并上传（约 0.8 秒）";
        hint.classList.remove("hot");
      }
    };

    const beginHold = (e) => {
      if (!state.recording.active) return;
      e.preventDefault();
      holding = true;
      btn.classList.add("hold-progress");
      const hint = $("#holdHint");
      if (hint) {
        hint.textContent = "按住以确认结束…";
        hint.classList.add("hot");
      }
      holdTimer = setTimeout(() => {
        if (holding) finishRecording(false);
      }, HOLD_MS);
    };

    btn.addEventListener("mousedown", beginHold);
    btn.addEventListener("touchstart", beginHold, { passive: false });
    ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((ev) => {
      btn.addEventListener(ev, clearHold);
    });
  }

  function finishRecording(autoCap) {
    stopRecordingTimers();
    const sec = Math.max(state.recording.sec, 3);
    state.recording.active = false;
    const id = "m" + Date.now();
    const title = `新录音 ${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
    const meeting = {
      id,
      title,
      summary: "",
      updatedAt: new Date().toISOString(),
      status: "queued",
      durationSec: sec,
      minutes: null,
      segments: [],
      insights: null,
      qa: [{ role: "ai", text: "转写与纪要完成后，可在此追问本场内容。" }],
    };
    state.meetings.unshift(meeting);
    toast(autoCap ? "已达上限，自动结束并上传" : "长按确认 · 已上传，进入转写");
    navigate(`#/meeting/${id}?tab=minutes`);
    simulatePipeline(id);
  }

  function simulatePipeline(id) {
    const m = findMeeting(id);
    if (!m) return;
    m.status = "queued";
    render();
    setTimeout(() => {
      m.status = "transcribing";
      render();
    }, 600);
    setTimeout(() => {
      m.segments = [
        { spk: 0, t: "00:00", text: "（原型）现场录音转写示例：我们今天对齐一下本周目标。" },
        { spk: 1, t: "00:12", text: "好的，我补充一下依赖和风险点。" },
        { spk: 0, t: "00:40", text: "待办：会后把纪要发到群里，并确认负责人。" },
      ];
      m.status = "minutes";
      render();
    }, 1800);
    setTimeout(() => {
      m.status = "ready";
      m.summary = "原型自动生成的一句话摘要：对齐目标、风险与待办。";
      m.minutes = {
        topic: m.title,
        time: fmtWhen(m.updatedAt),
        place: "现场（原型）",
        participants: "发言人 0；发言人 1",
        goal: "完成本次沟通的目标对齐与待办分配。",
        topics: [
          {
            title: "1、目标与背景",
            sub: "开场",
            bullets: ["对齐本周目标", "补充依赖与风险"],
          },
        ],
        dispute: "",
        actions: [{ who: "发言人 0", text: "会后把纪要发到群里，并确认负责人。" }],
        timeline: [
          { t: "00:00", title: "开场", body: "对齐目标。" },
          { t: "00:12", title: "风险", body: "依赖与风险点补充。" },
        ],
      };
      toast("转写完成 · 纪要已自动生成");
      render();
    }, 2800);
  }

  function mockImport(existingId, fileName) {
    const id = existingId || "m" + Date.now();
    const label = fileName || "audio.m4a";
    if (!existingId) {
      state.meetings.unshift({
        id,
        title: label.replace(/\.[^.]+$/, "") || "导入的音频",
        summary: "",
        updatedAt: new Date().toISOString(),
        status: "queued",
        durationSec: 120,
        minutes: null,
        segments: [],
        insights: null,
        qa: [],
      });
      toast("已选择文件「" + label + "」，开始转写（原型）");
      navigate(`#/meeting/${id}?tab=transcript`);
      simulatePipeline(id);
    } else {
      toast("已向本笔记导入「" + label + "」（原型合并）");
      const m = findMeeting(existingId);
      if (m && m.status === "ready") {
        /* keep ready; just toast */
      } else if (m) {
        simulatePipeline(existingId);
      }
      render();
    }
  }

  function structuredClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  window.addEventListener("hashchange", routeFromHash);
  if (!location.hash) location.hash = state.user ? "#/home" : "#/login";
  routeFromHash();
})();
