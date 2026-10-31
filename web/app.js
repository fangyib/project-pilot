const app = document.querySelector("#app");
const state = {
  screen: "chat",
  panel: "tree",
  projects: [],
  project: null,
  taskId: null,
  connections: [],
  preference: null,
  draft: "",
  suggestions: null,
  running: false,
  paused: false,
  picking: false,
  notice: null,
  dock: "compose",
  dockHeight: null,
  composer: "",
  managing: false,
  picked: [],
  lang: (() => { try { return localStorage.getItem("pilot-lang") === "en" ? "en" : "zh"; } catch { return "zh"; } })(),
};

const copy = {
  zh: {
    deleteSelected: "删除所选", doneManaging: "完成", manage: "管理", noProjects: "还没有项目",
    "panel.tree": "组织树", "panel.progress": "工作进程", "panel.needs": "需要你处理", "panel.activity": "最近变化",
    suggestLead: "按你的想法，建议这样开始。选一个就行，以后也能改。", recommended: "推荐", chatHero: "开始一个新的项目吧",
    ideaPlaceholder: "说说你想做什么", noStackYet: "不需要先填技术栈或 API", send: "发送",
    localUser: "本地用户", prefHint: "这些设置只用于模型推荐，之后可以随时修改，也可以只对一个项目或一项任务生效。",
    aiPref: "AI 偏好", save: "保存", sessionModels: "本次体验的模型连接",
    sessionHint: "给别人体验时不用填。想看真实模型，把 Key 贴在这里：只在这次服务运行期间有效，重启就清除，不会写进文件。",
    keyTail: "尾号", remove: "移除", noApi: "这次还没有填 API。不填也能体验，会用本地试用。", baseUrl: "服务地址", useSession: "用于本次体验",
    "pref.balance": "平衡", "pref.quality": "质量优先", "pref.cost": "性价比优先", "pref.speed": "速度优先", "pref.domestic": "只用国内服务", "pref.privacy": "更注意隐私",
    free: "免费", bestFit: "最合适", alternative: "备选", hasApi: "已有 API", noApiYet: "还没接入 API",
    trialNote: "当前还没有可直接调用的 API，执行时会先用本地试用。", pickSavedApi: "从已保存的 API 里选",
    noSavedApi: "还没有保存可用的 API。可以到 Mine 添加，或先采用上面的推荐。", byPreference: "按偏好推荐", fromSavedApi: "从已有 API 里选",
    models: "模型", modelHint: "每一部分有两种选法：按你的偏好从市面上的模型里推荐，或只在你已经保存的 API 里选。",
    runApp: "运行程序", resume: "继续", pause: "暂停", stop: "终止",
    dockPlaceholder: "提问，或直接让我改这个项目文件夹里的文件", expandChat: "展开对话", minimized: "已最小化",
    dockEmpty: "可以直接让我改这个项目文件夹里的文件，也可以提问或让进程继续。", chat: "对话", minimize: "最小化",
    retryAgain: "继续重试", nothingNeeded: "现在没有需要你处理的事项。", noChanges: "还没有变化。",
    backToTree: "返回组织树", noModel: "未选择模型", runs: "运行", noRuns: "还没有运行。", changes: "变更", noDiffs: "还没有变更。",
    checks: "验证", passed: "通过", failed: "失败", noChecks: "还没有验证。", noFolder: "未选择文件夹",
    pickingFolder: "请选择文件夹…", confirmPlan: "确认方案", building: "正在实现…", rerun: "用已保存的模型再做一次", alreadyDone: "已经做完了", startBuild: "开始实现",
    prefMismatch: "与偏好不符",
    "stack.game": "网页小游戏", "stack.gameDetail": "打开浏览器就能玩，适合先看效果",
    "stack.prototype": "只做可玩原型", "stack.prototypeDetail": "先做移动和一关，画面保持简单",
    "stack.site": "网页", "stack.siteDetail": "直接在浏览器里看结果",
    "stack.tool": "单页工具", "stack.toolDetail": "一个页面完成主要操作",
    "stack.web": "网页原型", "stack.webDetail": "最快看到可以运行的结果",
    "stack.cli": "命令行小工具", "stack.cliDetail": "适合处理文件或数据",
  },
  en: {
    deleteSelected: "Delete selected", doneManaging: "Done", manage: "Manage", noProjects: "No projects yet",
    "panel.tree": "Org tree", "panel.progress": "Work", "panel.needs": "Needs you", "panel.activity": "Recent changes",
    suggestLead: "Here's a way to start. Pick one. You can change it later.", recommended: "Recommended", chatHero: "Start a new project",
    ideaPlaceholder: "Say what you want to make", noStackYet: "No stack or API needed yet", send: "Send",
    localUser: "Local user", prefHint: "These settings only affect model recommendations. You can change them later, for the whole account, one project, or one task.",
    aiPref: "AI preference", save: "Save", sessionModels: "Models for this session",
    sessionHint: "Guests can skip this. To use a real model, paste a key. It lasts only until the server restarts and is not written to a file.",
    keyTail: "ending", remove: "Remove", noApi: "No API for this session. You can still try it locally.", baseUrl: "API base URL", useSession: "Use for this session",
    "pref.balance": "Balanced", "pref.quality": "Quality", "pref.cost": "Lower cost", "pref.speed": "Speed", "pref.domestic": "Domestic only", "pref.privacy": "More private",
    free: "Free", bestFit: "Best fit", alternative: "Alternative", hasApi: "API ready", noApiYet: "No API yet",
    trialNote: "No callable API yet. A local trial will run instead.", pickSavedApi: "Choose a saved API",
    noSavedApi: "No saved API yet. Add one in Mine, or use a recommendation above.", byPreference: "By preference", fromSavedApi: "From saved APIs",
    models: "Models", modelHint: "Each part has two choices: a recommendation from models on the market, or only APIs you have saved.",
    runApp: "Run app", resume: "Resume", pause: "Pause", stop: "Stop",
    dockPlaceholder: "Ask a question, or tell me to edit files in this project folder", expandChat: "Show chat", minimized: "Minimized",
    dockEmpty: "Ask me to edit files in this project folder, or ask a question and keep the run going.", chat: "Chat", minimize: "Minimize",
    retryAgain: "Retry again", nothingNeeded: "Nothing needs you right now.", noChanges: "No changes yet.",
    backToTree: "Back to org tree", noModel: "No model selected", runs: "Runs", noRuns: "No runs yet.", changes: "Changes", noDiffs: "No changes yet.",
    checks: "Checks", passed: "Passed", failed: "Failed", noChecks: "No checks yet.", noFolder: "No folder yet",
    pickingFolder: "Choose a folder…", confirmPlan: "Confirm plan", building: "Building…", rerun: "Run again with saved models", alreadyDone: "Done", startBuild: "Start building",
    prefMismatch: "Doesn't match preferences",
    "stack.game": "Browser game", "stack.gameDetail": "Play it in the browser and see the result quickly",
    "stack.prototype": "Playable prototype", "stack.prototypeDetail": "Movement and one level first, with simple art",
    "stack.site": "Web page", "stack.siteDetail": "See the result directly in the browser",
    "stack.tool": "Single-page tool", "stack.toolDetail": "One page for the main action",
    "stack.web": "Web prototype", "stack.webDetail": "The fastest way to a running result",
    "stack.cli": "Command-line tool", "stack.cliDetail": "Good for files or data",
  },
};

const phrases = {
  untested: "Untested", ok: "OK", failed: "Failed", succeeded: "Succeeded", cancelled: "Cancelled",
  "没有符合偏好的模型。": "No model matches your preferences.",
  "没有同时满足偏好和这项工作的模型。": "No model fits both your preferences and this work.",
  "整理需求": "Shape the requirements",
  "定义模块契约": "Define module contracts",
  "实现界面": "Build the interface",
  "实现核心逻辑": "Build the core logic",
  "集成可运行入口": "Build a runnable entry",
  "运行自动验证": "Run automatic checks",
  "整理玩法与范围": "Shape the gameplay and scope",
  "定义资源与代码契约": "Define asset and code contracts",
  "生成角色与场景素材": "Create character and scene assets",
  "编写移动与跳跃逻辑": "Write move and jump logic",
  "编写第一关数据": "Write the first level",
  "集成画面、逻辑和关卡": "Integrate art, logic, and levels",
  "运行玩法验证": "Run gameplay checks",
  "约定 src/app.js 的导出和页面入口。": "Agree on the exports in src/app.js and the page entry.",
  "提供可展示的界面脚本。": "Provide a script that can show the interface.",
  "导出能完成目标的函数。": "Export functions that do the job.",
  "验证导出函数的结果。": "Check the result of the exported functions.",
  "约定素材尺寸、文件路径和 createGame 接口。": "Agree on asset sizes, file paths, and the createGame interface.",
  "输出透明背景的角色 SVG，路径为 assets/player.svg。": "Output a transparent character SVG at assets/player.svg.",
  "导出 createGame(level)，提供 move 和 jump。": "Export createGame(level), with move and jump.",
  "提供 width 和 platforms。": "Provide width and platforms.",
  "生成可打开的游戏页面和验证脚本。": "Build a game page that opens, plus a check script.",
  "验证移动、边界和关卡数据。": "Check movement, edges, and level data.",
  "请选择下一步。": "Choose what to do next.",
  "重试": "Retry", "缩小范围": "Narrow the scope", "更换模型": "Change model", "交给我处理": "I'll handle it",
  "平衡": "Balanced", "质量优先": "Quality", "性价比优先": "Lower cost", "速度优先": "Speed",
  "国内服务优先": "Domestic first", "隐私优先": "Privacy first", "自定义": "Custom",
  "能力匹配：直接覆盖": "Capability: direct match", "能力匹配：部分相关": "Capability: partial match",
  "连接可用": "Connection ready", "需要先添加 API 连接": "Add an API connection first",
  "已暂停。可以回到组织树补充要求，再回来点继续。": "Paused. Add instructions on the org tree, then come back and resume.",
  "正在终止…": "Stopping…", "已继续。": "Resumed.", "控制失败": "Couldn't control the run",
  "正在回复…": "Replying…", "发送失败": "Couldn't send",
  "做完了。结果在「已完成」里。": "Done. The result is under Done.",
  "停住了，请打开右侧「需要你处理」。": "Stopped. Open Needs you on the right.",
  "还有任务没做完，可以再点开始实现。": "Some tasks are still open. Start building again.",
  "请先选择写入文件夹并确认方案": "Choose a folder and confirm the plan first",
  "开始实现失败": "Couldn't start", "正在实现…完成后会显示在下面。": "Building… The result will show below.",
  "更换模型失败": "Couldn't change the model",
  "请在弹出的窗口中选择要写入的文件夹。": "Choose the folder in the window that just opened.",
  "还没有选择文件夹，方案未确认。": "No folder selected. The plan is not confirmed.",
  "选择文件夹失败": "Couldn't choose a folder", "正在删除…": "Deleting…", "删除失败": "Couldn't delete",
  "正在重试…": "Retrying…", "已记下你的选择。": "Choice saved.", "处理失败": "Couldn't handle that", "重试失败": "Retry failed",
  "请求失败": "Request failed", "进程已暂停，请点继续": "The run is paused. Press Resume.",
  "进程已在运行": "The run is already going", "项目不存在": "Project not found", "任务不存在": "Task not found",
  "现在不能这样控制进程": "That control isn't available right now", "现在没有正在运行的进程": "Nothing is running",
  "先写一点内容": "Write something first", "确认项不存在": "That choice no longer exists",
  "请选择电脑上的文件夹": "Choose a folder on this computer", "这个文件夹不存在": "That folder does not exist",
  "请选择文件夹，而不是文件": "Choose a folder, not a file", "不能访问项目文件夹以外的位置": "That path is outside the project folder",
  "所选模型没有可用的 API 连接": "The selected model has no usable API connection", "连接不存在": "Connection not found",
};

const phrasePatterns = [
  [/^把“(.+)”整理成可执行范围。$/, (_, idea) => `Turn “${idea}” into a scope that can be built.`],
  [/^把“(.+)”拆成可验证的范围。$/, (_, idea) => `Split “${idea}” into a scope that can be checked.`],
  [/^生成可以直接打开的页面。页面本身就是「(.+)」，不要做成与这个想法无关的通用工具。$/, (_, idea) => `Build a page that opens directly. The page itself should be “${idea}”, not an unrelated generic tool.`],
  [/^「(.+)」没有通过。(.*)$/, (_, title, detail) => `“${tx(title)}” did not pass. ${tx(detail)}`],
  [/^「(.+)」上次选择了重试，但没有继续执行。$/, (_, title) => `“${tx(title)}” was set to retry, but it did not continue.`],
  [/^对话改了 (.+)$/, (_, files) => `Chat edited ${files}`],
  [/^(.+) 开始使用 (.+)$/, (_, title, model) => `${tx(title)} started with ${model}`],
  [/^写入 (.+)$/, (_, files) => `Wrote ${files}`],
  [/^(.+) 完成$/, (_, title) => `${tx(title)} finished`],
  [/^(.+) 已终止$/, (_, title) => `${tx(title)} stopped`],
  [/^将写入 (.+)$/, (_, name) => `Will write to ${name}`],
  [/^预计约 ¥(.+)$/, (_, cost) => `About ¥${cost}`],
  [/^偏好“(.+)”$/, (_, preset) => `Preference: ${tx(preset)}`],
  [/^与偏好不符：(.+)$/, (_, reason) => `Doesn't match preferences: ${tx(reason)}`],
];

let refreshSeq = 0;
const source = new EventSource("/api/events");
source.onmessage = async (event) => {
  const payload = JSON.parse(event.data);
  if (!state.project || payload.projectId !== state.project.id || state.screen !== "project") return;
  const seq = ++refreshSeq;
  const project = await api(`/api/projects/${state.project.id}`);
  if (seq !== refreshSeq) return;
  applyRunState(project);
  render();
};

await boot();

async function boot() {
  state.projects = await api("/api/projects");
  state.preference = await api("/api/preferences");
  state.connections = await api("/api/connections");
  render();
}

function t(key) {
  return copy[state.lang][key] ?? copy.zh[key] ?? key;
}

function tx(text) {
  const value = String(text ?? "");
  if (state.lang !== "en" || !value) return value;
  if (phrases[value]) return phrases[value];
  for (const [pattern, format] of phrasePatterns) {
    const match = value.match(pattern);
    if (match) return format(...match);
  }
  return value;
}

function render() {
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
  const projectOpen = state.screen === "project" && state.project;
  app.innerHTML = `<div class="shell ${projectOpen ? "with-right" : "no-right"}">
    ${leftBar()}
    <main class="center">${center()}</main>
    ${projectOpen ? rightBar() : ""}
  </div>`;
  bind();
}

function leftBar() {
  const projects = state.projects.map((project) => {
    const label = `${escape(project.name)}<br><small>${escape(folderLabel(project))}</small>`;
    if (!state.managing) return `<button class="project-link ${state.project?.id === project.id && state.screen === "project" ? "active" : ""}" data-project="${project.id}">${label}</button>`;
    const checked = state.picked.includes(project.id) ? "checked" : "";
    return `<label class="project-link"><input type="checkbox" data-pick-project="${project.id}" ${checked}><span>${label}</span></label>`;
  }).join("");
  const remove = state.managing ? `<button class="ghost danger" id="delete-projects" ${state.picked.length ? "" : "disabled"}>${t("deleteSelected")}</button>` : "";
  return `<aside class="side left">
    <div class="side-scroll">
      <div class="brand">PROJECT PILOT</div>
      <button class="nav ${state.screen === "chat" ? "active" : ""}" data-screen="chat">New Chat</button>
      <button class="nav ${state.screen === "mine" ? "active" : ""}" data-screen="mine">Mine</button>
      <div class="section section-row"><span>Projects</span><button class="text-btn" id="manage-projects">${state.managing ? t("doneManaging") : t("manage")}</button></div>
      ${projects || `<p class="muted">${t("noProjects")}</p>`}
      ${remove}
    </div>
    <button class="nav lang-btn" id="lang-toggle" type="button">${state.lang === "en" ? "中文" : "English"}</button>
  </aside>`;
}

function rightBar() {
  const items = [["tree", t("panel.tree")], ["progress", t("panel.progress")], ["needs", t("panel.needs")], ["activity", t("panel.activity")]];
  return `<aside class="side right"><div class="section">${escape(state.project.name)}</div>${items.map(([id, label]) => `<button class="nav ${state.panel === id ? "active" : ""}" data-panel="${id}">${label}</button>`).join("")}</aside>`;
}

function center() {
  if (state.screen === "chat") return `<div class="stage-body">${chat()}</div>`;
  if (state.screen === "mine") return `<div class="stage-body">${mine()}</div>`;
  if (state.panel === "task") return `<div class="stage-body">${taskDetail()}</div>`;
  if (state.panel === "progress") return withDock(progress());
  if (state.panel === "needs") return withDock(needs());
  if (state.panel === "activity") return `<div class="stage-body">${activity()}</div>`;
  return withDock(tree());
}

function withDock(body) {
  return `<div class="stage"><div class="stage-body">${body}</div>${dock()}</div>`;
}

function chat() {
  const suggestions = state.suggestions ? `<article class="bubble"><p>${t("suggestLead")}</p><div class="choices">${state.suggestions.map((item) => `<button class="choice" data-stack="${escape(item.stack)}"><strong>${escape(t(item.titleKey))}${item.recommended ? ` · ${t("recommended")}` : ""}</strong><span class="muted">${escape(t(item.detailKey))}</span></button>`).join("")}</div></article>` : "";
  return `<section class="chat"><div class="chat-hero">${t("chatHero")}</div>${suggestions}<form class="composer" id="idea-form"><textarea name="idea" rows="3" placeholder="${t("ideaPlaceholder")}">${escape(state.draft)}</textarea><div class="row"><span class="muted">${t("noStackYet")}</span><button class="send" type="submit">${t("send")}</button></div></form></section>`;
}

function mine() {
  const preset = state.preference?.preset ?? "balance";
  const options = [["balance", "pref.balance"], ["quality", "pref.quality"], ["cost", "pref.cost"], ["speed", "pref.speed"], ["domestic", "pref.domestic"], ["privacy", "pref.privacy"]];
  const connections = state.connections.map((item) => `<p>${escape(item.provider)} · ${t("keyTail")} ${escape(item.keyLast4)} · ${tx(item.status)} <button data-delete="${item.id}">${t("remove")}</button></p>`).join("") || `<p class="muted">${t("noApi")}</p>`;
  return `<section class="panel"><h1>Mine</h1><p>${t("localUser")}</p><p class="muted">${t("prefHint")}</p></section>
    <form id="preference" class="panel"><label>${t("aiPref")}<select name="preset">${options.map(([value, label]) => `<option value="${value}" ${value === preset ? "selected" : ""}>${t(label)}</option>`).join("")}</select></label><p><button class="primary">${t("save")}</button></p></form>
    <form id="connection" class="panel"><h2>${t("sessionModels")}</h2><p class="muted">${t("sessionHint")}</p>${connections}<label>${t("baseUrl")}<input name="baseUrl" value="https://api.deepseek.com/v1"></label><label>API Key<input name="apiKey" type="password" required></label><p><button class="primary">${t("useSession")}</button></p></form>`;
}

function tree() {
  const project = state.project;
  const layout = layoutTasks(project.tasks);
  const cards = project.tasks.map((task) => {
    const point = layout.positions.get(task.id);
    return `<button class="tree-card" data-task="${task.id}" style="left:${point.x}px;top:${point.y}px"><strong>${escape(tx(task.title))}</strong><small>${capabilityLabel(task.capability)} · ${statusLabel(task.status)}</small></button>`;
  }).join("");
  const lines = project.tasks.flatMap((task) => task.dependsOn.map((parentId) => line(layout.positions.get(parentId), layout.positions.get(task.id)))).join("");
  const graph = `<div class="tree-wrap" style="width:${layout.width}px;height:${layout.height}px"><svg class="lines" viewBox="0 0 ${layout.width} ${layout.height}">${lines}</svg>${cards}</div>`;
  const head = `<div class="row"><h1>${escape(project.name)}</h1>${actionButton(project)}</div>${noticeLine()}<p class="muted">${escape(project.idea)}</p>`;
  if (project.confirmed) return `${head}${graph}`;
  return `${head}<div class="plan-split"><div class="plan-tree">${graph}</div><aside class="plan-models">${modelPicker(project)}</aside></div>`;
}

function modelCost(item) {
  if (!item) return "";
  const amount = (item.estimatedCostCents / 100).toFixed(2);
  return item.estimatedCostCents ? (state.lang === "en" ? `about ¥${amount}` : `约 ¥${amount}`) : t("free");
}

function modelPicker(project) {
  const cards = project.tasks.map((task) => {
    const recommendation = task.recommendation ?? { primary: null, alternatives: [], connected: [] };
    const market = [recommendation.primary, ...(recommendation.alternatives ?? [])].filter((item) => item && !String(item.modelId).startsWith("trial-"));
    const connected = recommendation.connected ?? [];
    const selected = task.selectedModelId ?? recommendation.primary?.modelId ?? "";
    const picks = market.map((item) => {
      const on = item.modelId === selected;
      const note = [item.modelId === recommendation.primary?.modelId ? t("bestFit") : t("alternative"), tx(item.reasons?.[0]), modelCost(item), item.available ? t("hasApi") : t("noApiYet")].filter(Boolean).join(" · ");
      return `<button type="button" class="choice ${on ? "on" : ""}" data-pick="${task.id}" data-value="${escape(item.modelId)}"><strong>${escape(item.label)}${item.modelId === recommendation.primary?.modelId ? ` · ${t("recommended")}` : ""}</strong><span class="muted">${escape(note)}</span></button>`;
    }).join("") || `<p class="muted">${escape(tx(recommendation.noCandidateReason || "没有符合偏好的模型。"))}</p>`;
    const apiSelected = connected.some((item) => item.modelId === selected);
    const options = connected.map((item) => `<option value="${escape(item.modelId)}" ${item.modelId === selected ? "selected" : ""}>${escape(item.label)}${item.reasons?.[0]?.startsWith("与偏好不符") ? ` · ${t("prefMismatch")}` : ""}</option>`).join("");
    const trialNote = String(selected).startsWith("trial-") ? `<p class="muted">${t("trialNote")}</p>` : "";
    const api = connected.length
      ? `<select data-model="${task.id}"><option value="" ${apiSelected ? "" : "selected"} disabled>${t("pickSavedApi")}</option>${options}</select>${trialNote}`
      : `<p class="muted">${t("noSavedApi")}</p>${trialNote}`;
    return `<article class="model-card" data-model-card="${task.id}"><div class="row"><strong>${escape(tx(task.title))}</strong><span class="muted">${capabilityLabel(task.capability)}</span></div><p class="kicker">${t("byPreference")}</p><div class="model-picks">${picks}</div><p class="kicker">${t("fromSavedApi")}</p>${api}</article>`;
  }).join("");
  return `<h2>${t("models")}</h2><p class="muted">${t("modelHint")}</p>${cards}`;
}

function progress() {
  const columns = ["pending", "running", "needs_user", "done"].map((status) => `<section class="column"><h2>${statusLabel(status)}</h2>${state.project.tasks.filter((task) => matchesColumn(task, status)).map((task) => `<button class="task" data-task="${task.id}">${escape(tx(task.title))}<br><span class="muted">${capabilityLabel(task.capability)}</span></button>`).join("")}</section>`).join("");
  const launch = finished(state.project) ? `<p class="launch-row"><button class="primary" id="launch">${t("runApp")}</button></p>` : "";
  return `<div class="row"><h1>${t("panel.progress")}</h1><div class="actions">${controlButtons()}${actionButton(state.project)}</div></div>${noticeLine()}<div class="board">${columns}</div>${launch}`;
}

function runPaused() {
  return Boolean(state.paused || state.project?.runState === "paused");
}

function controlButtons() {
  const paused = runPaused();
  const live = paused || state.running || state.project.runState === "running";
  return `<button class="ghost" id="pause" ${live ? "" : "disabled"}>${paused ? t("resume") : t("pause")}</button><button class="ghost" id="stop" ${live ? "" : "disabled"}>${t("stop")}</button>`;
}

function applyRunState(project) {
  state.project = project;
  state.paused = project.runState === "paused";
  state.running = project.runState === "running" || project.runState === "paused";
}

function dockField() {
  return `<textarea id="dock-text" name="text" rows="1" autocomplete="off" placeholder="${t("dockPlaceholder")}">${escape(state.composer)}</textarea>`;
}

function dock() {
  const messages = state.project.messages ?? [];
  if (state.dock === "min") {
    return `<div class="dock dock-min"><button class="ghost" id="dock-open">${t("expandChat")}</button><span class="muted">${t("minimized")}</span></div>`;
  }
  if (state.dock !== "open") {
    return `<form class="dock dock-compose" id="dock-form" autocomplete="off">${dockField()}<button class="send" type="submit">${t("send")}</button></form>`;
  }
  const height = state.dockHeight ? `${state.dockHeight}px` : "50%";
  const log = messages.map((item) => `<p class="msg ${item.role}">${escape(item.text)}</p>`).join("") || `<p class="muted">${t("dockEmpty")}</p>`;
  return `<section class="dock dock-open" style="height:${height}"><div class="dock-resize" id="dock-resize"></div><div class="dock-bar"><span>${t("chat")}</span><button class="ghost" id="dock-min">${t("minimize")}</button></div><div class="dock-log">${log}</div><form class="dock-form" id="dock-form" autocomplete="off">${dockField()}<button class="send" type="submit">${t("send")}</button></form></section>`;
}

function needs() {
  const items = state.project.decisions.filter((item) => !item.resolvedAt);
  const stalled = state.project.tasks.filter((task) => (task.status === "blocked" || task.status === "needs_user") && !items.some((item) => item.taskId === task.id));
  const open = items.map((item) => `<article class="panel"><p>${escape(tx(item.prompt))}</p><div class="choices">${item.options.map((option) => `<button class="choice" data-decision="${item.id}" data-choice="${escape(option)}">${escape(tx(option))}</button>`).join("")}</div></article>`).join("");
  const waiting = stalled.map((task) => `<article class="panel"><p>${escape(tx(`「${task.title}」上次选择了重试，但没有继续执行。`))}</p><div class="choices"><button class="choice" data-retry="${task.id}">${t("retryAgain")}</button></div></article>`).join("");
  const body = `${open}${waiting}` || `<p class="muted">${t("nothingNeeded")}</p>`;
  return `<h1>${t("panel.needs")}</h1>${noticeLine()}${body}`;
}

function activity() {
  const events = [...state.project.events].reverse();
  return `<h1>${t("panel.activity")}</h1>${events.map((event) => `<article class="panel">${escape(tx(event.message))}<br><span class="muted">${escape(event.at)}</span></article>`).join("") || `<p class="muted">${t("noChanges")}</p>`}`;
}

function taskDetail() {
  const task = state.project.tasks.find((item) => item.id === state.taskId);
  const runs = state.project.runs.filter((run) => run.taskId === task.id);
  const changes = state.project.changesets.filter((item) => item.taskId === task.id);
  const checks = state.project.verifications.filter((item) => item.taskId === task.id);
  return `<button data-panel="tree">${t("backToTree")}</button><h1>${escape(tx(task.title))}</h1><p class="muted">${capabilityLabel(task.capability)} · ${statusLabel(task.status)} · ${escape(task.selectedModelId ?? t("noModel"))}</p><p>${escape(tx(task.acceptance))}</p>
    <article class="panel"><h2>${t("runs")}</h2>${runs.map((run) => `<pre>${escape(tx(run.status))}\n${escape(run.logs.join("\n"))}</pre>`).join("") || `<p class="muted">${t("noRuns")}</p>`}</article>
    <article class="panel"><h2>${t("changes")}</h2>${changes.map((item) => `<p>${item.files.map((file) => `${escape(file.path)} +${file.additions}`).join(state.lang === "en" ? ", " : "、")}</p>`).join("") || `<p class="muted">${t("noDiffs")}</p>`}</article>
    <article class="panel"><h2>${t("checks")}</h2>${checks.map((item) => `<pre>${item.passed ? t("passed") : t("failed")}\n${escape(item.evidence)}</pre>`).join("") || `<p class="muted">${t("noChecks")}</p>`}</article>`;
}

function bind() {
  const lang = app.querySelector("#lang-toggle");
  if (lang) lang.onclick = () => {
    state.lang = state.lang === "en" ? "zh" : "en";
    try { localStorage.setItem("pilot-lang", state.lang); } catch { /* keep the choice for this visit */ }
    render();
  };
  for (const button of app.querySelectorAll("[data-screen]")) button.onclick = () => { state.screen = button.dataset.screen; state.suggestions = null; render(); };
  for (const button of app.querySelectorAll("[data-project]")) button.onclick = () => openProject(button.dataset.project);
  const manage = app.querySelector("#manage-projects");
  if (manage) manage.onclick = () => { state.managing = !state.managing; state.picked = []; render(); };
  for (const box of app.querySelectorAll("[data-pick-project]")) box.onchange = () => {
    const id = box.dataset.pickProject;
    state.picked = box.checked ? [...state.picked, id] : state.picked.filter((item) => item !== id);
    const remove = app.querySelector("#delete-projects");
    if (remove) remove.disabled = state.picked.length === 0;
  };
  const removeProjects = app.querySelector("#delete-projects");
  if (removeProjects) removeProjects.onclick = () => deleteProjects();
  for (const button of app.querySelectorAll("[data-panel]")) button.onclick = () => { state.panel = button.dataset.panel; render(); };
  for (const button of app.querySelectorAll("[data-task]")) button.onclick = () => {
    if (state.project && !state.project.confirmed) {
      for (const card of app.querySelectorAll(".model-card")) card.classList.remove("picked");
      const card = app.querySelector(`[data-model-card="${button.dataset.task}"]`);
      if (card) {
        card.classList.add("picked");
        card.scrollIntoView({ block: "nearest" });
      }
      return;
    }
    state.taskId = button.dataset.task;
    state.panel = "task";
    render();
  };
  for (const button of app.querySelectorAll("[data-pick]")) button.onclick = () => chooseModel(button.dataset.pick, button.dataset.value);
  for (const select of app.querySelectorAll("[data-model]")) select.onchange = () => { if (select.value) chooseModel(select.dataset.model, select.value); };
  const ideaForm = app.querySelector("#idea-form");
  if (ideaForm) ideaForm.onsubmit = (event) => {
    event.preventDefault();
    state.draft = new FormData(ideaForm).get("idea").trim();
    if (!state.draft) return;
    state.suggestions = suggestStacks(state.draft);
    render();
  };
  for (const button of app.querySelectorAll("[data-stack]")) button.onclick = () => createFromIdea(button.dataset.stack);
  const confirm = app.querySelector("#confirm");
  if (confirm) confirm.onclick = () => confirmProject();
  const run = app.querySelector("#run");
  if (run) run.onclick = () => startRun(false);
  const rerun = app.querySelector("#rerun");
  if (rerun) rerun.onclick = () => startRun(true);
  const pause = app.querySelector("#pause");
  if (pause) pause.onclick = () => controlRun(runPaused() ? "resume" : "pause");
  const stop = app.querySelector("#stop");
  if (stop) stop.onclick = () => controlRun("stop");
  const launch = app.querySelector("#launch");
  if (launch) launch.onclick = () => window.open(`/api/projects/${state.project.id}/app/`, "_blank", "noopener");
  const dockMin = app.querySelector("#dock-min");
  if (dockMin) dockMin.onclick = () => { state.dock = "min"; render(); };
  const dockOpen = app.querySelector("#dock-open");
  if (dockOpen) dockOpen.onclick = () => { state.dock = "open"; render(); };
  const dockText = app.querySelector("#dock-text");
  if (dockText) {
    dockText.oninput = () => { state.composer = dockText.value; };
    dockText.onkeydown = (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        dockText.form?.requestSubmit();
      }
    };
  }
  const dockForm = app.querySelector("#dock-form");
  if (dockForm) dockForm.onsubmit = (event) => {
    event.preventDefault();
    state.composer = String(new FormData(dockForm).get("text") ?? "");
    sendDock();
  };
  const dockResize = app.querySelector("#dock-resize");
  if (dockResize) dockResize.onpointerdown = startDockResize;
  const dockLog = app.querySelector(".dock-log");
  if (dockLog) dockLog.scrollTop = dockLog.scrollHeight;
  for (const button of app.querySelectorAll("[data-decision]")) button.onclick = () => answerDecision(button.dataset.decision, button.dataset.choice);
  for (const button of app.querySelectorAll("[data-retry]")) button.onclick = () => resumeTask(button.dataset.retry);
  const preference = app.querySelector("#preference");
  if (preference) preference.onsubmit = async (event) => {
    event.preventDefault();
    const preset = new FormData(preference).get("preset");
    state.preference = await api("/api/preferences", { method: "PUT", body: { ...state.preference, preset, region: preset === "domestic" ? "domestic" : "any", allowForeignData: preset !== "privacy" } });
    render();
  };
  const connection = app.querySelector("#connection");
  if (connection) connection.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(connection);
    await api("/api/connections", { method: "POST", body: { provider: "deepseek", baseUrl: data.get("baseUrl"), apiKey: data.get("apiKey"), modelIds: ["deepseek-chat", "deepseek-reasoner"] } });
    state.connections = await api("/api/connections");
    render();
  };
  for (const button of app.querySelectorAll("[data-delete]")) button.onclick = async () => {
    await api(`/api/connections/${button.dataset.delete}`, { method: "DELETE" });
    state.connections = await api("/api/connections");
    render();
  };
}

async function createFromIdea(stack) {
  const project = await api("/api/projects", { method: "POST", body: { idea: state.draft, stack } });
  state.projects = await api("/api/projects");
  state.draft = "";
  state.suggestions = null;
  await openProject(project.id);
}

function hasConnection() {
  return state.connections.some((item) => item.status !== "failed");
}

function finished(project) {
  return project.tasks.length > 0 && project.tasks.every((task) => task.status === "done");
}

function folderLabel(project) {
  const folder = project.outputDir || "";
  const name = folder.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop();
  return name || t("noFolder");
}

function actionButton(project) {
  if (state.picking) return `<button class="primary" disabled>${t("pickingFolder")}</button>`;
  if (!project.confirmed) return `<button class="primary" id="confirm">${t("confirmPlan")}</button>`;
  if (runPaused()) return "";
  if (state.running) return `<button class="primary" disabled>${t("building")}</button>`;
  if (finished(project) && hasConnection()) return `<button class="primary" id="rerun">${t("rerun")}</button>`;
  if (finished(project)) return `<span class="muted">${t("alreadyDone")}</span>`;
  return `<button class="primary" id="run">${t("startBuild")}</button>`;
}

function noticeLine() {
  return state.notice ? `<p class="notice">${escape(tx(state.notice))}</p>` : "";
}

async function answerDecision(decisionId, choice) {
  state.running = true;
  state.panel = choice === "重试" ? "progress" : state.panel;
  state.notice = choice === "重试" ? "正在重试…" : "已记下你的选择。";
  render();
  try {
    state.project = await api(`/api/projects/${state.project.id}/decisions/${decisionId}`, { method: "POST", body: { choice } });
    if (choice === "重试") await runCurrentProject(false);
    else state.notice = "已记下你的选择。";
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "处理失败";
  } finally {
    state.running = false;
    render();
  }
}

async function resumeTask(taskId) {
  state.running = true;
  state.panel = "progress";
  state.notice = "正在重试…";
  render();
  try {
    await api(`/api/projects/${state.project.id}/tasks/${taskId}/retry`, { method: "POST", body: {} });
    await runCurrentProject(false);
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "重试失败";
  } finally {
    state.running = false;
    render();
  }
}

async function controlRun(action) {
  try {
    const project = await api(`/api/projects/${state.project.id}/control`, { method: "POST", body: { action } });
    applyRunState(project);
    state.notice = action === "pause" ? "已暂停。可以回到组织树补充要求，再回来点继续。" : action === "stop" ? "正在终止…" : "已继续。";
    render();
    if (action === "resume" && project.runState !== "running") await startRun(false);
    return;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "控制失败";
  }
  render();
}

function startDockResize(event) {
  const dock = event.currentTarget.parentElement;
  const startY = event.clientY;
  const startHeight = dock.getBoundingClientRect().height;
  const move = (ev) => {
    const next = Math.min(window.innerHeight * 0.8, Math.max(160, startHeight + startY - ev.clientY));
    state.dockHeight = next;
    dock.style.height = `${next}px`;
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

async function sendDock() {
  const text = state.composer.trim();
  if (!text || !state.project) return;
  state.composer = "";
  state.dock = "open";
  state.notice = "正在回复…";
  render();
  try {
    const result = await api(`/api/projects/${state.project.id}/messages`, { method: "POST", body: { text } });
    applyRunState(result.project);
    state.projects = state.projects.map((item) => item.id === result.project.id ? result.project : item);
    state.notice = null;
    render();
    if (result.followUp === "execute" && result.project.runState !== "running") await startRun(false);
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "发送失败";
    state.composer = text;
    render();
  }
}

async function runCurrentProject(restart) {
  const mode = hasConnection() ? "connected" : "trial";
  const project = await api(`/api/projects/${state.project.id}/execute`, { method: "POST", body: { mode, restart } });
  refreshSeq += 1;
  applyRunState(project);
  state.notice = outcomeNotice(project);
}

function outcomeNotice(project) {
  if (project.status === "delivered") return "做完了。结果在「已完成」里。";
  const waiting = project.decisions.some((item) => !item.resolvedAt) || project.tasks.some((task) => task.status === "blocked" || task.status === "needs_user");
  if (waiting) return "停住了，请打开右侧「需要你处理」。";
  return "还有任务没做完，可以再点开始实现。";
}

async function startRun(restart) {
  if (runPaused()) {
    state.panel = "progress";
    await controlRun("resume");
    return;
  }
  state.running = true;
  state.panel = "progress";
  state.notice = "正在实现…完成后会显示在下面。";
  render();
  try {
    if (!state.project.confirmed) throw new Error("请先选择写入文件夹并确认方案");
    await runCurrentProject(restart);
  } catch (error) {
    refreshSeq += 1;
    state.notice = error instanceof Error ? error.message : "开始实现失败";
  } finally {
    state.paused = state.project?.runState === "paused";
    state.running = state.project?.runState === "running" || state.paused;
    render();
  }
}

async function chooseModel(taskId, modelId) {
  try {
    const project = await api(`/api/projects/${state.project.id}/tasks/${taskId}`, { method: "PATCH", body: { selectedModelId: modelId } });
    state.project = project;
    state.projects = state.projects.map((item) => item.id === project.id ? project : item);
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "更换模型失败";
  }
  render();
}

async function confirmProject() {
  if (state.picking || !state.project) return;
  state.picking = true;
  state.notice = "请在弹出的窗口中选择要写入的文件夹。";
  render();
  try {
    const picked = await api("/api/folders/pick", { method: "POST", body: {} });
    if (!picked?.path) {
      state.notice = "还没有选择文件夹，方案未确认。";
      return;
    }
    const projectId = state.project.id;
    await api(`/api/projects/${projectId}/confirm`, { method: "POST", body: { outputDir: picked.path } });
    state.projects = await api("/api/projects");
    await openProject(projectId);
    state.notice = `将写入 ${folderLabel({ outputDir: picked.path })}`;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "选择文件夹失败";
  } finally {
    state.picking = false;
    render();
  }
}

async function deleteProjects() {
  const ids = [...state.picked];
  if (!ids.length) return;
  state.notice = "正在删除…";
  render();
  try {
    for (const id of ids) await api(`/api/projects/${id}`, { method: "DELETE" });
    if (state.project && ids.includes(state.project.id)) {
      state.project = null;
      state.screen = "chat";
      state.running = false;
      state.paused = false;
    }
    state.projects = await api("/api/projects");
    state.picked = [];
    state.managing = false;
    state.notice = null;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "删除失败";
  }
  render();
}

async function openProject(id) {
  state.notice = null;
  state.project = await api(`/api/projects/${id}`);
  state.screen = "project";
  state.panel = "tree";
  applyRunState(state.project);
  state.dock = state.project.messages?.length ? "open" : "compose";
  state.dockHeight = null;
  state.composer = "";
  render();
}

function suggestStacks(idea) {
  if (/游戏|闯关|画面|game|jump/i.test(idea)) return [
    { titleKey: "stack.game", detailKey: "stack.gameDetail", stack: "HTML + JavaScript", recommended: true },
    { titleKey: "stack.prototype", detailKey: "stack.prototypeDetail", stack: "Canvas" },
  ];
  if (/网站|页面|界面|site|page|ui/i.test(idea)) return [
    { titleKey: "stack.site", detailKey: "stack.siteDetail", stack: "HTML + JavaScript", recommended: true },
    { titleKey: "stack.tool", detailKey: "stack.toolDetail", stack: "单页应用" },
  ];
  return [
    { titleKey: "stack.web", detailKey: "stack.webDetail", stack: "HTML + JavaScript", recommended: true },
    { titleKey: "stack.cli", detailKey: "stack.cliDetail", stack: "Node.js" },
  ];
}

function layoutTasks(tasks) {
  const depth = new Map();
  const visit = (task) => {
    if (depth.has(task.id)) return depth.get(task.id);
    const value = task.dependsOn.length ? 1 + Math.max(...task.dependsOn.map((id) => visit(tasks.find((item) => item.id === id)))) : 0;
    depth.set(task.id, value);
    return value;
  };
  tasks.forEach(visit);
  const rows = [];
  for (const task of tasks) (rows[depth.get(task.id)] ??= []).push(task);
  const card = { w: 180, h: 72, x: 36, y: 72 };
  const width = Math.max(720, ...rows.map((row) => row.length * (card.w + card.x)));
  const positions = new Map();
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.length * card.w + (row.length - 1) * card.x;
    let x = Math.max(20, (width - rowWidth) / 2);
    for (const task of row) {
      positions.set(task.id, { x, y: 20 + rowIndex * (card.h + card.y) });
      x += card.w + card.x;
    }
  });
  return { positions, width, height: 40 + rows.length * (card.h + card.y) };
}

function line(from, to) {
  if (!from || !to) return "";
  const x1 = from.x + 90;
  const y1 = from.y + 72;
  const x2 = to.x + 90;
  const y2 = to.y;
  const mid = (y1 + y2) / 2;
  return `<path d="M ${x1} ${y1} V ${mid} H ${x2} V ${y2}" fill="none" stroke="#4d5360" stroke-width="1.5"/>`;
}

function matchesColumn(task, status) {
  if (status === "needs_user") return task.status === "needs_user" || task.status === "blocked";
  return task.status === status;
}

function capabilityLabel(capability) {
  const labels = {
    zh: { planning: "规划", architecture: "架构", frontend: "界面", backend: "逻辑", game_logic: "游戏逻辑", visual_asset: "画面", level_design: "关卡", review: "审查", testing: "验证", integration: "集成" },
    en: { planning: "Planning", architecture: "Architecture", frontend: "Interface", backend: "Logic", game_logic: "Game logic", visual_asset: "Art", level_design: "Level", review: "Review", testing: "Checks", integration: "Integration" },
  };
  return labels[state.lang][capability] ?? capability;
}

function statusLabel(status) {
  const labels = {
    zh: { blueprint: "待确认", ready: "待执行", running: "进行中", pending: "待执行", needs_user: "待确认", blocked: "待确认", done: "已完成", delivered: "已完成" },
    en: { blueprint: "To confirm", ready: "To do", running: "In progress", pending: "To do", needs_user: "Needs you", blocked: "Needs you", done: "Done", delivered: "Done" },
  };
  return labels[state.lang][status] ?? tx(status);
}

async function api(pathname, options = {}) {
  const response = await fetch(pathname, { method: options.method ?? "GET", headers: { "Content-Type": "application/json" }, body: options.body ? JSON.stringify(options.body) : undefined });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "请求失败");
  return payload;
}

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
