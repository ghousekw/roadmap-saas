// ─── Configuration ─────────────────────────────────────────────────────────────
const CONFIG = {
  supabaseUrl: 'https://npqevqiwmsibqswtjjpc.supabase.co',
  supabaseAnonKey: 'sb_publishable_HR7eoJUtI058I2TQqdif1Q_wtwygTiR'
};

// Diagram configuration
const DIAGRAM_CONFIG = {
  phaseGap: 600,
  taskGap: 450,   /* Significantly increased for clear mind map */
  horizontalOffset: 550,
  nodeWidth: 320,
  taskNodeWidth: 420,
  phaseHeight: 80,
  topicHeight: 60,
  topicY: 100
};

// ─── Supabase init ─────────────────────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

// ─── State ────────────────────────────────────────────────────────────────────
let currentRoadmap = null;
let currentTopic = "";
let currentUser = null;

// ─── Auth ─────────────────────────────────────────────────────────────────────
db.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user ?? null;
  const emailEl = document.getElementById("user-email");
  const authBtn = document.getElementById("auth-btn");
  if (currentUser) {
    emailEl.textContent = currentUser.email;
    authBtn.textContent = "Sign out";
  } else {
    emailEl.textContent = "";
    authBtn.textContent = "Sign in";
  }
});

async function handleAuth() {
  if (currentUser) {
    await db.auth.signOut();
    showToast("Signed out");
  } else {
    const email = prompt("Enter your email — we'll send you a magic link:");
    if (!email) return;
    const { error } = await db.auth.signInWithOtp({ email });
    if (error) return showToast("Error: " + error.message);
    showToast("Check your email for a magic link ✓");
  }
}

// ─── Generate ─────────────────────────────────────────────────────────────────
async function generate() {
  const topic = document.getElementById("topic").value.trim();
  if (!topic) return showError("Please enter a topic first.");
  
  hideError();
  showLoading(true);
  document.getElementById("gen-btn").disabled = true;
  document.getElementById("output-section").style.display = "none";

  try {
    const res = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: topic, model: "nvidia" }),
    });

    if (!res.ok) throw new Error("Server error");
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const roadmap = parseRoadmap(text);

    currentRoadmap = roadmap;
    currentTopic = topic;

    renderRoadmap(topic, roadmap);
    await saveRoadmap(topic, roadmap);
  } catch (err) {
    showError(err.message || "Something went wrong.");
  } finally {
    showLoading(false);
    document.getElementById("gen-btn").disabled = false;
  }
}

function parseRoadmap(text) {
  try {
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return { title: "Roadmap", phases: [{ title: "Basics", tasks: [text] }] };
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderRoadmap(topic, roadmap) {
  const section = document.getElementById("output-section");
  const topicEl = document.getElementById("output-topic");
  topicEl.textContent = topic;

  renderRoadmapDiagram(topic, roadmap);
  updateOverallProgress();
  section.style.display = "block";
  setTimeout(() => section.scrollIntoView({ behavior: "smooth" }), 100);
}

function renderRoadmapDiagram(topic, roadmap) {
  const container = document.getElementById("roadmap-diagram");
  if (!container) return;
  container.innerHTML = "";
  container.style.display = "block";

  const phases = roadmap.phases || [];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "diagram-svg");
  container.appendChild(svg);

  const draw = () => {
    container.querySelectorAll(".node").forEach(n => n.remove());
    svg.innerHTML = "";
    const centerX = container.offsetWidth / 2;
    let currentY = DIAGRAM_CONFIG.topicY;

    const topicNode = createNode(topic, "node-topic", centerX, currentY);
    container.appendChild(topicNode);
    let prevPhasePoint = { x: centerX, y: currentY + DIAGRAM_CONFIG.topicHeight / 2 };
    currentY += 180;

    phases.forEach((phase, phaseIdx) => {
      const tasks = phase.tasks || [];
      const phaseX = centerX;
      
      // Recursive Height Calculation (Compact)
      const getNodeHeight = (nodeId, meta) => {
        let h = 220; // Base task height
        if (meta && meta.expanded && meta.subRoadmap) {
          const subTasks = meta.subRoadmap.phases?.[0]?.tasks || [];
          subTasks.forEach((st, stIdx) => {
            const subId = `${nodeId}.s${stIdx}`;
            const subMeta = currentRoadmap.nodeMeta?.[subId];
            h += getNodeHeight(subId, subMeta) * 0.45; // Significantly more compact
          });
          h += 50; 
        }
        return h;
      };

      let phaseInternalY = 0;
      const taskPlacements = tasks.map((task, tIdx) => {
        const nodeId = `${phaseIdx}-${tIdx}`;
        const meta = currentRoadmap.nodeMeta?.[nodeId] || {};
        const taskHeight = getNodeHeight(nodeId, meta);
        const placement = { task, tIdx, nodeId, meta, taskHeight, relativeY: phaseInternalY };
        phaseInternalY += taskHeight;
        return placement;
      });

      const phaseTotalHeight = phaseInternalY;
      const phaseY = currentY + (phaseTotalHeight / 2) - 100;

      // Render Phase Header
      const phaseNode = createNode(
        `<div><div class="node-title">${escHtml(phase.title)}</div><div class="node-meta">${escHtml(phase.duration || "")}</div></div>`,
        `node-phase node-p${phaseIdx % 4}`,
        phaseX, phaseY
      );
      container.appendChild(phaseNode);
      drawConnection(svg, prevPhasePoint, { x: phaseX, y: phaseY - DIAGRAM_CONFIG.phaseHeight / 2 }, "spine");
      
      const side = (phaseIdx % 2 === 0) ? 1 : -1; 
      
      const renderNodesRecursive = (items, parentX, parentY, parentNodeId, level, s) => {
        let currentLevelY = parentY - (items.length * 40); // Tighter base

        items.forEach((item, idx) => {
          const nodeId = `${parentNodeId}.s${idx}`;
          const meta = currentRoadmap.nodeMeta?.[nodeId] || {};
          const isDone = !!meta.completedAt;
          
          const nodeX = parentX + (200 * s); // Closer horizontally
          const nodeY = currentLevelY + 80;
          
          const content = `
            <div class="sub-task ${isDone ? 'done' : ''}">
               <div class="sub-task-text">${escHtml(item)}</div>
               <div class="sub-task-footer">
                  <span class="sub-dive-btn" onclick="event.stopPropagation(); recursiveDeepDive('${nodeId}', ${escAttr(item)})">
                    ${meta.subRoadmap ? (meta.expanded ? '−' : '+') : '+ Detail'}
                  </span>
               </div>
            </div>
          `;
          
          const subNode = createNode(content, `node-sub-task level-${level}`, nodeX, nodeY);
          subNode.onclick = () => recursiveDeepDive(nodeId, item);
          container.appendChild(subNode);
          
          drawConnection(svg, {x: parentX, y: parentY + 20}, {x: nodeX, y: nodeY}, "sub");
          
          if (meta.expanded && meta.subRoadmap) {
             const nestedTasks = meta.subRoadmap.phases?.[0]?.tasks || [];
             renderNodesRecursive(nestedTasks, nodeX, nodeY, nodeId, level + 1, s);
             currentLevelY += (nestedTasks.length * 80);
          }
          currentLevelY += 100; // Tighter vertical gaps
        });
      };

      taskPlacements.forEach((p) => {
        const taskX = phaseX + (DIAGRAM_CONFIG.horizontalOffset * side);
        const taskY = (phaseY - phaseTotalHeight / 2) + p.relativeY + 110;
        const isDone = !!p.meta.completedAt;

        const taskContent = `
          <div class="task ${isDone ? 'done' : ''}" data-node-id="${p.nodeId}">
            ${isDone ? '<div class="node-done-badge">LEARNED</div>' : ''}
            <div class="task-handle">≡</div>
            <div class="task-body">
               <span class="task-text">${escHtml(p.task)}</span>
            </div>
            <div class="task-footer">
              <button class="dive-action-btn" onclick="event.stopPropagation(); recursiveDeepDive('${p.nodeId}', ${escAttr(p.task)})">
                ${p.meta.subRoadmap ? (p.meta.expanded ? 'Collapse' : 'Expand') : 'Deep Dive +'}
              </button>
              <span class="task-btn" onclick="event.stopPropagation(); openTaskWorkspace('${p.nodeId}', ${escAttr(p.task)})">Studio →</span>
            </div>
          </div>
        `;

        const taskNode = createNode(taskContent, `node-task node-p${phaseIdx % 4} ${isDone ? 'done' : ''}`, taskX, taskY);
        taskNode.onclick = () => recursiveDeepDive(p.nodeId, p.task);
        container.appendChild(taskNode);
        
        drawConnection(svg, {x: phaseX, y: phaseY}, { x: taskX - (DIAGRAM_CONFIG.taskNodeWidth / 2) * side, y: taskY }, "dotted");

        if (p.meta.expanded && p.meta.subRoadmap) {
          const subTasks = p.meta.subRoadmap.phases?.[0]?.tasks || [];
          renderNodesRecursive(subTasks, taskX, taskY, p.nodeId, 1, side);
        }
      });

      prevPhasePoint = { x: phaseX, y: phaseY + DIAGRAM_CONFIG.phaseHeight / 2 };
      currentY += Math.max(800, phaseTotalHeight + 400); 
    });
    container.style.minHeight = (currentY + 100) + "px";
  };

  setTimeout(draw, 50);
  window.addEventListener('resize', draw);
  renderSidebar();
}

// ─── Studio Workspace ─────────────────────────────────────────────────────────
let activeWorkspaceNode = null;

function openTaskWorkspace(nodeId, taskTitle) {
  if (!currentRoadmap.nodeMeta) currentRoadmap.nodeMeta = {};
  activeWorkspaceNode = { nodeId, title: taskTitle };
  
  if (!currentRoadmap.nodeMeta[nodeId]) {
    currentRoadmap.nodeMeta[nodeId] = { customLinks: [], completedAt: null };
  }
  const meta = currentRoadmap.nodeMeta[nodeId];

  document.getElementById("workspace-title").textContent = taskTitle;
  document.getElementById("task-workspace").classList.add("open");

  const btn = document.getElementById("mark-done-btn");
  btn.onclick = () => toggleTaskCompletion(nodeId);

  const ts = document.getElementById("workspace-timestamp");
  if (meta.completedAt) {
    btn.textContent = "Mark as Unlearned";
    btn.classList.add("btn-secondary"); btn.classList.remove("btn-primary");
    ts.style.display = "inline-block";
    const d = new Date(meta.completedAt);
    ts.textContent = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  } else {
    btn.textContent = "Mark as Learned ✓";
    btn.classList.add("btn-primary"); btn.classList.remove("btn-secondary");
    ts.style.display = "none";
  }

  const aiList = document.getElementById("workspace-ai-resources");
  const resources = [
    { title: "Documentation", desc: "Reference material", url: `https://www.google.com/search?q=${encodeURIComponent(taskTitle + " documentation")}` },
    { title: "Tutorials", desc: "Guides & Videos", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(taskTitle + " tutorial")}` },
    { title: "Examples", desc: "Practical code", url: `https://github.com/search?q=${encodeURIComponent(taskTitle)}` }
  ];
  aiList.innerHTML = resources.map(r => `
    <a href="${r.url}" target="_blank" class="resource-link">
      <div style="font-weight: 800; font-size: 11px; text-transform: uppercase; color: var(--accent); margin-bottom: 4px;">${r.title}</div>
      <div style="font-size: 13px; font-weight: 600;">Explore ${r.desc}</div>
    </a>
  `).join("");

  renderCustomLinks();
}

function closeTaskWorkspace() {
  document.getElementById("task-workspace").classList.remove("open");
  activeWorkspaceNode = null;
}

async function recursiveDeepDive(nodeId, title) {
  if (!currentRoadmap.nodeMeta) currentRoadmap.nodeMeta = {};
  if (!currentRoadmap.nodeMeta[nodeId]) {
    currentRoadmap.nodeMeta[nodeId] = { customLinks: [], completedAt: null, expanded: false };
  }
  
  const meta = currentRoadmap.nodeMeta[nodeId];
  
  if (meta.subRoadmap) {
    showToast(meta.expanded ? "Collapsing..." : "Expanding...");
    meta.expanded = !meta.expanded;
    renderRoadmapDiagram(currentTopic, currentRoadmap);
    return;
  }

  showLoading(true);
  try {
    const res = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        prompt: `Create a detailed technical sub-roadmap for the specific sub-topic: "${title}". This is a nested node. Provide 3 specific learning tasks.`,
        model: "nvidia"
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const subRoadmap = parseRoadmap(text);
    
    meta.subRoadmap = subRoadmap;
    meta.expanded = true;
    
    await saveRoadmap(currentTopic, currentRoadmap);
    renderRoadmapDiagram(currentTopic, currentRoadmap);
    showToast("Deep dive deeper!");
  } catch (err) {
    showError("Could not dive deeper at this time.");
  } finally {
    showLoading(false);
  }
}

async function toggleTaskCompletion(nodeId) {
  const meta = currentRoadmap.nodeMeta[nodeId];
  meta.completedAt = meta.completedAt ? null : new Date().toISOString();
  
  await saveRoadmap(currentTopic, currentRoadmap);
  renderRoadmapDiagram(currentTopic, currentRoadmap);
  updateOverallProgress();
}

function renderCustomLinks() {
  const nodeId = `${activeWorkspaceNode.phaseIdx}-${activeWorkspaceNode.taskIdx}`;
  const meta = currentRoadmap.nodeMeta[nodeId];
  const container = document.getElementById("workspace-custom-resources");
  if (!meta.customLinks || meta.customLinks.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 2rem; border: 2px dashed var(--border); color: var(--muted); font-size: 12px; font-weight:700;">No saved links yet. Paste a URL above.</div>`;
    return;
  }
  container.innerHTML = meta.customLinks.map((l, i) => `
    <div class="resource-link" style="flex-direction:row; justify-content:space-between; align-items:center; padding: 1rem;">
      <a href="${l.url}" target="_blank" style="text-decoration:none; color:inherit; display:flex; gap:12px; align-items:center; flex:1; overflow:hidden;">
        <span style="font-size:20px;">📎</span>
        <strong style="text-transform:lowercase; font-size: 13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${l.title}</strong>
      </a>
      <span class="remove-link-btn" onclick="removeCustomLink(${i})">&times;</span>
    </div>
  `).join("");
}

async function addCustomLink() {
  if (!activeWorkspaceNode) return;
  const input = document.getElementById("custom-link-url");
  const url = input.value.trim();
  if (!url) return;
  
  let finalUrl = url;
  if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl;
  let domain = "Link";
  try { domain = new URL(finalUrl).hostname.replace("www.", ""); } catch (e) {}

  const nodeId = `${activeWorkspaceNode.phaseIdx}-${activeWorkspaceNode.taskIdx}`;
  currentRoadmap.nodeMeta[nodeId].customLinks.push({ url: finalUrl, title: domain });
  input.value = "";
  renderCustomLinks();
  await saveRoadmap(currentTopic, currentRoadmap);
}

async function removeCustomLink(idx) {
  if (!activeWorkspaceNode) return;
  const nodeId = `${activeWorkspaceNode.phaseIdx}-${activeWorkspaceNode.taskIdx}`;
  currentRoadmap.nodeMeta[nodeId].customLinks.splice(idx, 1);
  renderCustomLinks();
  await saveRoadmap(currentTopic, currentRoadmap);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createNode(content, className, x, y) {
  const div = document.createElement("div");
  div.className = `node ${className}`; div.innerHTML = content;
  div.style.left = `${x}px`; div.style.top = `${y}px`; div.style.transform = "translate(-50%, -50%)";
  div.style.position = "absolute";
  return div;
}

function drawConnection(svg, p1, p2, extraClass) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", `connector-path ${extraClass || ''}`);
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  let d = (Math.abs(dx) < 10) ? `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}` : 
    `M ${p1.x} ${p1.y} C ${p1.x + dx * 0.45} ${p1.y}, ${p1.x + dx * 0.55} ${p2.y}, ${p2.x} ${p2.y}`;
  path.setAttribute("d", d);
  svg.appendChild(path);
}

function updateOverallProgress() {
  if (!currentRoadmap || !currentRoadmap.phases) return;
  let total = 0, completed = 0;
  currentRoadmap.phases.forEach((p, pIdx) => {
    p.tasks.forEach((t, tIdx) => {
      total++;
      if (currentRoadmap.nodeMeta?.[`${pIdx}-${tIdx}`]?.completedAt) completed++;
    });
  });
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const bar = document.getElementById("overall-progress-bar");
  const percentEl = document.getElementById("overall-progress-percent");
  if (bar) bar.style.width = percent + "%";
  if (percentEl) percentEl.textContent = percent + "%";
}

function renderSidebar() {
  const container = document.getElementById("roadmap-diagram");
  const sidebar = document.createElement("div");
  sidebar.style.cssText = "position: absolute; top: 0; left: 0; width: 220px; z-index: 10; padding: 2rem; border: var(--border-width) solid var(--border); background: #fff; box-shadow: var(--shadow); border-radius: 12px;";
  sidebar.innerHTML = `
    <div style="font-family: var(--sans); font-weight: 900; font-size: 1rem; margin-bottom: 1rem; color: var(--text); text-transform: uppercase;">Knowledge Map</div>
    <ul style="list-style: none; font-size: 13px; font-weight: 700; color: var(--muted); line-height: 2.2;">
      <li>● Click nodes for Studio</li>
      <li>● Save personal references</li>
      <li>● Track learning status</li>
    </ul>
  `;
  container.appendChild(sidebar);
}

function triggerDeepDive(phaseIdx, taskIdx, title) {
  activeWorkspaceNode = { phaseIdx, taskIdx, title };
  deepDive();
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(str) {
  return "'" + String(str).replace(/'/g, "&#39;") + "'";
}

let progressInterval = null;

function showLoading(on) {
  const loadingEl = document.getElementById("loading");
  const progressBar = document.getElementById("progress-bar");
  const progressPercent = document.getElementById("progress-percent");
  const loadingText = document.getElementById("loading-text");

  if (on) {
    loadingEl.style.display = "block";
    let progress = 0;
    if (progressBar) progressBar.style.width = "0%";
    if (progressPercent) progressPercent.textContent = "0%";
    
    const stages = [
      { p: 20, t: "Connecting to AI..." },
      { p: 40, t: "Analyzing topic..." },
      { p: 60, t: "Structuring phases..." },
      { p: 80, t: "Polishing nodes..." }
    ];
    let stageIdx = 0;

    progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += Math.random() * 2;
        if (stageIdx < stages.length && progress >= stages[stageIdx].p) {
          loadingText.textContent = stages[stageIdx].t;
          stageIdx++;
        }
        if (progressBar) progressBar.style.width = progress + "%";
        if (progressPercent) progressPercent.textContent = Math.round(progress) + "%";
      }
    }, 150);
  } else {
    clearInterval(progressInterval);
    if (progressBar) progressBar.style.width = "100%";
    if (progressPercent) progressPercent.textContent = "100%";
    setTimeout(() => {
      loadingEl.style.display = "none";
    }, 500);
  }
}

function showError(msg) {
  const el = document.getElementById("error-bar");
  el.textContent = msg; el.style.display = "block";
}

function hideError() {
  document.getElementById("error-bar").style.display = "none";
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

async function saveRoadmap(topic, data) {
  if (!currentUser) return;
  const { error } = await db.from("roadmaps").upsert({
    user_id: currentUser.id,
    topic,
    data,
    is_public: true
  }, { onConflict: 'user_id, topic' });
  if (!error) showToast("Knowledge saved");
}

async function loadHistory() {
  const { data } = await db.from("roadmaps").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false });
  const grid = document.getElementById("history-grid");
  if (!data?.length) { grid.innerHTML = "<p>No maps yet</p>"; } else {
    grid.innerHTML = data.map(r => `<div class="history-item" onclick='loadSavedRoadmap(${JSON.stringify(r)})'>${escHtml(r.topic)}</div>`).join("");
  }
}

function loadSavedRoadmap(record) {
  currentRoadmap = record.data;
  currentTopic = record.topic;
  renderRoadmap(record.topic, record.data);
}

function generateTaskTip(task, phase) {
  return "Focus on understanding the core concepts of " + task;
}

function toggleHistory() {
  const s = document.getElementById("history-section");
  s.style.display = s.style.display === "block" ? "none" : "block";
  if (s.style.display === "block") loadHistory();
}

// Allow Enter key to generate
document.getElementById("topic").addEventListener("keydown", e => {
  if (e.key === "Enter") generate();
});