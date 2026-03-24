// ─── Configuration ─────────────────────────────────────────────────────────────
// In production, these are injected by the build process or set via Wrangler variables
// For local development, set these in a config object or replace the values below

const CONFIG = {
  supabaseUrl: typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://npqevqiwmsibqswtjjpc.supabase.co',
  supabaseAnonKey: typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : 'sb_publishable_HR7eoJUtI058I2TQqdif1Q_wtwygTiR'
};

// ─── Supabase init ─────────────────────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(
  CONFIG.supabaseUrl,
  CONFIG.supabaseAnonKey
);

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
  const model = "nvidia"; // Using Nvidia Llama only

  if (!topic) return showError("Please enter a topic first.");
  if (topic.length > 300) return showError("Topic must be under 300 characters.");

  hideError();
  showLoading(true);
  document.getElementById("gen-btn").disabled = true;
  document.getElementById("output-section").style.display = "none";

  try {
    const res = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: topic, model }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const data = await res.json();

    // Extract the roadmap JSON from Nvidia API response (OpenAI format)
    const text = data.choices?.[0]?.message?.content ?? "";
    const roadmap = parseRoadmap(text);

    currentRoadmap = roadmap;
    currentTopic = topic;

    renderRoadmap(topic, roadmap);
    await saveRoadmap(topic, roadmap);

  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
  } finally {
    showLoading(false);
    document.getElementById("gen-btn").disabled = false;
  }
}

// ─── Parse & Render ───────────────────────────────────────────────────────────
function parseRoadmap(text) {
  try {
    // Strip markdown code fences if present
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON found");
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    // Fallback: wrap raw text as a single-phase roadmap
    return {
      title: "Your Roadmap",
      phases: [{
        title: "Getting Started",
        duration: "Ongoing",
        description: text.slice(0, 300),
        tasks: [text],
        milestone: "Complete this phase"
      }]
    };
  }
}

function generateTaskTip(task, phase) {
  const milestone = phase.milestone || "the phase milestone";
  const verbs = ["Focus on", "Practice", "Master", "Understand", "Build", "Explore"];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  return `${verb} "${task.slice(0, 50)}${task.length>50?'...':''}" to achieve ${milestone}.`;
}

function updateOverallProgress() {
  const container = document.getElementById("phases-container");
  if (!container) return;
  const checkboxes = container.querySelectorAll(".task-check");
  const total = checkboxes.length;
  const completed = container.querySelectorAll(".task-check:checked").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const bar = document.getElementById("overall-progress-bar");
  const percentEl = document.getElementById("overall-progress-percent");
  if (bar) bar.style.width = percent + "%";
  if (percentEl) percentEl.textContent = percent + "%";
}

function renderRoadmap(topic, roadmap) {
  const colors = ["p1", "p2", "p3", "p4"];
  const labels = ["Foundation", "Building", "Advanced", "Mastery"];
  const section = document.getElementById("output-section");
  const container = document.getElementById("phases-container");
  const topicEl = document.getElementById("output-topic");

  // Safe DOM update
  topicEl.textContent = "";
  topicEl.appendChild(document.createTextNode("Roadmap: "));
  const span = document.createElement("span");
  span.textContent = topic;
  topicEl.appendChild(span);

  container.innerHTML = "";

  const phases = roadmap.phases || [];
  phases.forEach((phase, phaseIdx) => {
    const colorClass = colors[phaseIdx % colors.length];
    const label = labels[phaseIdx % labels.length];

    // Create phase card
    const card = document.createElement("div");
    card.className = `phase-card ${colorClass}`;
    card.dataset.phaseIndex = phaseIdx;

    // Header
    const header = document.createElement("div");
    header.className = "phase-header";

    const phaseNum = document.createElement("div");
    phaseNum.className = "phase-num";
    phaseNum.textContent = String(phaseIdx + 1).padStart(2, "0");
    header.appendChild(phaseNum);

    const meta = document.createElement("div");
    meta.className = "phase-meta";
    const title = document.createElement("div");
    title.className = "phase-title";
    title.textContent = phase.title || `Phase ${phaseIdx + 1}`;
    meta.appendChild(title);
    if (phase.duration) {
      const dur = document.createElement("div");
      dur.className = "phase-duration";
      dur.textContent = phase.duration;
      meta.appendChild(dur);
    }
    header.appendChild(meta);

    const progress = document.createElement("div");
    progress.className = "phase-progress";
    progress.textContent = label;
    header.appendChild(progress);

    card.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "phase-body";

    if (phase.description) {
      const desc = document.createElement("div");
      desc.className = "phase-desc";
      desc.textContent = phase.description;
      body.appendChild(desc);
    }

    // Tasks
    const tasksContainer = document.createElement("div");
    tasksContainer.className = "tasks";

    (phase.tasks || []).forEach((task, taskIdx) => {
      const taskEl = document.createElement("div");
      taskEl.className = "task";
      taskEl.dataset.phase = phaseIdx;
      taskEl.dataset.task = taskIdx;

      // Checkbox
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-check";
      taskEl.appendChild(checkbox);

      // Drag handle
      const handle = document.createElement("span");
      handle.className = "task-handle";
      handle.title = "Drag to reorder";
      handle.textContent = "⋮⋮";
      taskEl.appendChild(handle);

      // Task text
      const taskText = document.createElement("span");
      taskText.className = "task-text";
      taskText.contentEditable = "false";
      taskText.textContent = task;
      taskEl.appendChild(taskText);

      // Actions
      const actions = document.createElement("div");
      actions.className = "task-actions";

      // Edit button
      const editBtn = document.createElement("button");
      editBtn.className = "task-btn task-edit-btn";
      editBtn.title = "Edit task";
      editBtn.textContent = "✏️";
      actions.appendChild(editBtn);

      // Copy button
      const copyBtn = document.createElement("button");
      copyBtn.className = "task-btn task-copy-btn";
      copyBtn.title = "Copy task";
      copyBtn.textContent = "📋";
      actions.appendChild(copyBtn);

      // Tooltip toggle
      const tooltipToggle = document.createElement("span");
      tooltipToggle.className = "task-btn task-tooltip-toggle";
      tooltipToggle.title = "Show tip";
      tooltipToggle.textContent = "ⓘ";

      // Tooltip
      const tooltip = document.createElement("div");
      tooltip.className = "task-tooltip";
      tooltip.style.display = "none";
      tooltip.textContent = "💡 " + generateTaskTip(task, phase);

      actions.appendChild(tooltipToggle);
      actions.appendChild(tooltip);
      taskEl.appendChild(actions);

      tasksContainer.appendChild(taskEl);
    });

    body.appendChild(tasksContainer);

    if (phase.milestone) {
      const milestone = document.createElement("div");
      milestone.className = "milestone";
      const strong = document.createElement("strong");
      strong.textContent = "Milestone:";
      milestone.appendChild(strong);
      milestone.appendChild(document.createTextNode(" " + phase.milestone));
      body.appendChild(milestone);
    }

    card.appendChild(body);
    container.appendChild(card);
  });

  // Show overall progress
  const progressContainer = document.getElementById("overall-progress-container");
  if (progressContainer) {
    progressContainer.style.display = "block";
    updateOverallProgress();
  }

  section.style.display = "block";

  setTimeout(() => {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

function togglePhaseCollapsed(phaseCard) {
  phaseCard.classList.toggle("collapsed");
}

function toggleTaskCompleted(taskEl) {
  const checkbox = taskEl.querySelector(".task-check");
  taskEl.classList.toggle("completed", checkbox.checked);
  updateOverallProgress();
}

function enableTaskEdit(taskTextEl, phaseIdx, taskIdx) {
  const currentText = taskTextEl.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentText;
  input.className = "edit-input";
  input.style.cssText = "width: 100%; font: inherit; padding: 4px; border: 1px solid var(--accent); border-radius: 4px; background: var(--surface2); color: var(--text); outline: none; box-sizing: border-box;";
  taskTextEl.replaceWith(input);
  input.focus();
  input.select();
  const saveEdit = () => {
    const newText = input.value.trim() || currentText;
    const newSpan = document.createElement("span");
    newSpan.className = "task-text";
    newSpan.contentEditable = "false";
    newSpan.textContent = newText;
    input.replaceWith(newSpan);
    if (currentRoadmap && currentRoadmap.phases && currentRoadmap.phases[phaseIdx]) {
      currentRoadmap.phases[phaseIdx].tasks[taskIdx] = newText;
    }
    showToast("Task updated");
  };
  input.addEventListener("blur", saveEdit);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      input.value = currentText;
      input.blur();
    }
  });
}

function copyTaskText(btn) {
  const taskEl = btn.closest(".task");
  const text = taskEl.querySelector(".task-text").textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Task copied!");
  }).catch(err => {
    showToast("Failed to copy");
    console.error(err);
  });
}

function showTaskTooltip(toggleBtn) {
  const tooltip = toggleBtn.closest(".task-actions").querySelector(".task-tooltip");
  if (tooltip) {
    const isVisible = tooltip.style.display === "block";
    tooltip.style.display = isVisible ? "none" : "block";
    if (!isVisible) {
      setTimeout(() => {
        tooltip.style.display = "none";
      }, 3000);
    }
  }
}

function startTaskDrag(e) {
  const taskEl = e.target.closest(".task");
  if (!taskEl) return;
  taskEl.classList.add("dragging");
  e.dataTransfer.setData("text/plain", `${taskEl.dataset.phase}-${taskEl.dataset.task}`);
  e.dataTransfer.effectAllowed = "move";
  window.draggedTask = taskEl;
}

function handleTaskDrop(e) {
  e.preventDefault();
  const targetTask = e.target.closest(".task");
  if (!targetTask || !window.draggedTask) return;
  const dragged = window.draggedTask;
  if (dragged === targetTask) return;
  const fromPhase = parseInt(dragged.dataset.phase);
  const fromTask = parseInt(dragged.dataset.task);
  const toPhase = parseInt(targetTask.dataset.phase);
  const toTask = parseInt(targetTask.dataset.task);
  reorderTask(fromPhase, fromTask, toPhase, toTask);
  dragged.classList.remove("dragging");
  window.draggedTask = null;
}

function reorderTask(fromPhaseIdx, fromTaskIdx, toPhaseIdx, toTaskIdx) {
  const container = document.getElementById("phases-container");
  const draggedEl = container.querySelector(`.task[data-phase="${fromPhaseIdx}"][data-task="${fromTaskIdx}"]`);
  const targetEl = container.querySelector(`.task[data-phase="${toPhaseIdx}"][data-task="${toTaskIdx}"]`);
  if (!draggedEl || !targetEl) return;

  // Determine insertion position: after if target is after or in later phase, else before
  if (toTaskIdx > fromTaskIdx || toPhaseIdx > fromPhaseIdx) {
    targetEl.after(draggedEl);
  } else {
    targetEl.before(draggedEl);
  }

  // Update data in currentRoadmap
  if (currentRoadmap && currentRoadmap.phases) {
    const fromPhase = currentRoadmap.phases[fromPhaseIdx];
    const toPhase = currentRoadmap.phases[toPhaseIdx];
    const [movedTask] = fromPhase.tasks.splice(fromTaskIdx, 1);
    // Adjust target index if moving within same phase and target after original
    let adjustedToTaskIdx = toTaskIdx;
    if (fromPhaseIdx === toPhaseIdx && toTaskIdx > fromTaskIdx) {
      adjustedToTaskIdx = toTaskIdx - 1;
    }
    toPhase.tasks.splice(adjustedToTaskIdx, 0, movedTask);
    updateDataAttributes();
    showToast("Task reordered");
  }
}

function updateDataAttributes() {
  const container = document.getElementById("phases-container");
  const phaseCards = container.querySelectorAll(".phase-card");
  phaseCards.forEach((card, phaseIdx) => {
    card.dataset.phaseIndex = phaseIdx;
    const tasks = card.querySelectorAll(".task");
    tasks.forEach((task, taskIdx) => {
      task.dataset.phase = phaseIdx;
      task.dataset.task = taskIdx;
    });
  });
}

// Initialize event listeners
(function initInteractions() {
  const container = document.getElementById("phases-container");
  if (!container) return;

  // Phase collapse
  container.addEventListener("click", e => {
    const header = e.target.closest(".phase-header");
    if (header) {
      const card = header.closest(".phase-card");
      if (card) card.classList.toggle("collapsed");
    }
  });

  // Checkbox change
  container.addEventListener("change", e => {
    if (e.target.classList.contains("task-check")) {
      const taskEl = e.target.closest(".task");
      if (taskEl) toggleTaskCompleted(taskEl);
    }
  });

  // Copy button
  container.addEventListener("click", e => {
    if (e.target.classList.contains("task-copy-btn")) {
      copyTaskText(e.target);
    }
  });

  // Edit button
  container.addEventListener("click", e => {
    if (e.target.classList.contains("task-edit-btn")) {
      const taskEl = e.target.closest(".task");
      if (taskEl) {
        const phaseIdx = parseInt(taskEl.dataset.phase);
        const taskIdx = parseInt(taskEl.dataset.task);
        const taskTextEl = taskEl.querySelector(".task-text");
        enableTaskEdit(taskTextEl, phaseIdx, taskIdx);
      }
    }
  });

  // Tooltip toggle
  container.addEventListener("click", e => {
    if (e.target.classList.contains("task-tooltip-toggle")) {
      showTaskTooltip(e.target);
    }
  });

  // Double-click edit
  container.addEventListener("dblclick", e => {
    if (e.target.classList.contains("task-text")) {
      const taskEl = e.target.closest(".task");
      if (taskEl) {
        const phaseIdx = parseInt(taskEl.dataset.phase);
        const taskIdx = parseInt(taskEl.dataset.task);
        enableTaskEdit(e.target, phaseIdx, taskIdx);
      }
    }
  });

  // Drag and drop
  container.addEventListener("mousedown", e => {
    if (e.target.classList.contains("task-handle")) {
      startTaskDrag(e);
    }
  });

  container.addEventListener("dragover", e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  container.addEventListener("drop", handleTaskDrop);

  // Close tooltips on outside click
  document.addEventListener("click", e => {
    if (!e.target.closest(".task-tooltip-toggle")) {
      const tooltips = container.querySelectorAll(".task-tooltip[style*='display: block']");
      tooltips.forEach(t => t.style.display = "none");
    }
  });
})();

// ─── Save & History ───────────────────────────────────────────────────────────
async function saveRoadmap(topic, data) {
  if (!currentUser) return;
  const public_id = crypto.randomUUID();

  const { error } = await db.from("roadmaps").insert({
    user_id: currentUser.id,
    topic,
    data,
    public_id,
    is_public: true,
  });

  if (!error) {
    showToast(`Saved! Share: ${location.origin}/r/${public_id}`);
  }
}

async function toggleHistory() {
  const section = document.getElementById("history-section");
  if (section.style.display === "block") {
    section.style.display = "none";
    return;
  }
  if (!currentUser) return showToast("Sign in to see your history");
  await loadHistory();
}

async function loadHistory() {
  const { data, error } = await db
    .from("roadmaps")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const section = document.getElementById("history-section");
  const grid = document.getElementById("history-grid");

  if (error || !data?.length) {
    grid.innerHTML = `<p style="color:var(--muted);font-size:14px;">No roadmaps yet — generate your first one above.</p>`;
  } else {
    grid.innerHTML = data.map(r => `
      <div class="history-item" onclick="loadSavedRoadmap(${escAttr(JSON.stringify(r))})">
        <div class="history-topic">${escHtml(r.topic)}</div>
        <div class="history-meta">${new Date(r.created_at).toLocaleDateString()}</div>
        ${r.public_id ? `<a class="history-share" href="/r/${r.public_id}" onclick="event.stopPropagation()" target="_blank">View public link ↗</a>` : ""}
      </div>
    `).join("");
  }

  section.style.display = "block";
  section.scrollIntoView({ behavior: "smooth" });
}

function loadSavedRoadmap(record) {
  currentRoadmap = record.data;
  currentTopic = record.topic;
  document.getElementById("topic").value = record.topic;
  renderRoadmap(record.topic, record.data);
  document.getElementById("history-section").style.display = "none";
}

// ─── Share ────────────────────────────────────────────────────────────────────
async function copyShareLink() {
  if (!currentRoadmap) return showToast("Generate a roadmap first");

  // Try to find most recent saved public_id
  if (currentUser) {
    const { data } = await db.from("roadmaps")
      .select("public_id")
      .eq("user_id", currentUser.id)
      .eq("topic", currentTopic)
      .order("created_at", { ascending: false })
      .limit(1);

    if (data?.[0]?.public_id) {
      const url = `${location.origin}/r/${data[0].public_id}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      return showToast("Link copied to clipboard ✓");
    }
  }
  showToast("Sign in to get a shareable link");
}

// ─── PDF Export (FIXED: multi-page with proper wrapping) ──────────────────────
function downloadPDF() {
  if (!currentRoadmap) return showToast("Generate a roadmap first");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxW = pageW - margin * 2;
  let y = margin;

  // Phase color palette (matching UI colors)
  const phaseColors = [
    [200, 240, 96],
    [96, 212, 240],
    [240, 160, 96],
    [176, 96, 240]
  ];

  function checkPage(needed = 10) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function writeLine(text, size = 11, style = "normal", color = [30, 30, 30]) {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text), maxW);
    checkPage(lines.length * (size * 0.45));
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.45) + 2;
  }

  // Title page - centered with border
  doc.setFillColor(13, 13, 15);
  doc.rect(0, 0, pageW, pageH, "F");
  // Page border
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);
  const centerX = pageW / 2;
  const startY = pageH * 0.4;
  doc.setTextColor(200, 240, 96);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.text("Pathfinder", centerX, startY, { align: "center" });
  doc.setTextColor(240, 237, 232);
  doc.setFontSize(20);
  doc.text(doc.splitTextToSize(currentTopic, maxW), centerX, startY + 30, { align: "center" });
  doc.setTextColor(122, 120, 128);
  doc.setFontSize(12);
  doc.text("Learning Roadmap", centerX, startY + 60, { align: "center" });
  doc.text(`Generated ${new Date().toLocaleDateString()}`, centerX, pageH - 30, { align: "center" });

  // Content pages
  doc.addPage();
  y = margin;

  writeLine(currentTopic, 24, "bold", [20, 20, 20]);
  y += 8;

  const phases = currentRoadmap.phases || [];
  phases.forEach((phase, i) => {
    checkPage(20);
    y += 4;

    // Phase header bar
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(margin, y - 4, maxW, 14, 2, 2, "F");

    // Phase number and title in phase color
    const phaseColor = phaseColors[i % phaseColors.length];
    doc.setTextColor(...phaseColor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Phase ${i + 1}: ${phase.title || ""}`, margin + 4, y + 6);

    // Duration in gray
    if (phase.duration) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(130, 130, 130);
      doc.text(phase.duration, pageW - margin - 4, y + 6, { align: "right" });
    }
    y += 22;

    if (phase.description) {
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(11);
      const descLines = doc.splitTextToSize(phase.description, maxW);
      checkPage(descLines.length * 5);
      doc.text(descLines, margin, y);
      y += descLines.length * 5 + 4;
    }

    (phase.tasks || []).forEach(task => {
      checkPage(8);
      // Task bullet in phase color
      doc.setFillColor(...phaseColors[i % phaseColors.length]);
      doc.circle(margin + 2, y - 1, 1.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(task, maxW - 8);
      doc.text(lines, margin + 6, y);
      y += lines.length * 5 + 2;
    });

    if (phase.milestone) {
      checkPage(12);
      y += 2;
      // Light milestone box with phase color text
      doc.setFillColor(245, 250, 240);
      const mLines = doc.splitTextToSize("✓ " + phase.milestone, maxW - 8);
      doc.roundedRect(margin, y - 4, maxW, mLines.length * 5 + 6, 2, 2, "F");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...phaseColors[i % phaseColors.length]);
      doc.text(mLines, margin + 4, y);
      y += mLines.length * 5 + 8;
    }
  });

  // Add headers and footers to all content pages (page 2 and beyond)
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    // Header: topic and page number
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(currentTopic, margin, 12);
    doc.text(`Page ${p - 1} of ${totalPages - 1}`, pageW - margin, 12, { align: "right" });
    // Footer: generation date and brand
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated ${new Date().toLocaleDateString()} by Pathfinder`, pageW / 2, pageH - 10, { align: "center" });
  }

  doc.save(`roadmap-${currentTopic.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.pdf`);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
let progressInterval = null;

function showLoading(on) {
  const loadingEl = document.getElementById("loading");
  const progressBar = document.getElementById("progress-bar");
  const progressPercent = document.getElementById("progress-percent");
  const loadingText = document.getElementById("loading-text");

  if (on) {
    loadingEl.style.display = "block";
    let progress = 0;

    // Reset UI
    if (progressBar) progressBar.style.width = "0%";
    if (progressPercent) progressPercent.textContent = "0%";
    if (loadingText) loadingText.textContent = "Connecting to AI...";

    // Progress stages
    const stages = [
      { progress: 20, text: "Analyzing your topic..." },
      { progress: 35, text: "Structuring learning phases..." },
      { progress: 50, text: "Generating tasks..." },
      { progress: 70, text: "Refining roadmap..." },
      { progress: 85, text: "Finalizing..." }
    ];
    let stageIndex = 0;

    // Simulate progress
    progressInterval = setInterval(() => {
      // Update stage text
      if (stageIndex < stages.length && progress >= stages[stageIndex].progress) {
        if (loadingText) loadingText.textContent = stages[stageIndex].text;
        stageIndex++;
      }

      // Increment progress (slower as it approaches 90%)
      if (progress < 85) {
        progress += Math.random() * 2 + 0.5;
      } else if (progress < 90) {
        progress += 0.3;
      }

      if (progress > 90) progress = 90;

      if (progressBar) progressBar.style.width = progress + "%";
      if (progressPercent) progressPercent.textContent = Math.round(progress) + "%";
    }, 80);
  } else {
    // Complete progress
    if (progressBar) progressBar.style.width = "100%";
    if (progressPercent) progressPercent.textContent = "100%";
    if (loadingText) loadingText.textContent = "Complete!";

    clearInterval(progressInterval);
    progressInterval = null;

    // Hide after brief delay
    setTimeout(() => {
      loadingEl.style.display = "none";
      if (progressBar) progressBar.style.width = "0%";
      if (progressPercent) progressPercent.textContent = "0%";
    }, 400);
  }
}

function showError(msg) {
  const el = document.getElementById("error-bar");
  el.textContent = msg;
  el.style.display = "block";
}

function hideError() {
  document.getElementById("error-bar").style.display = "none";
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {
  return "'" + String(str).replace(/'/g, "&#39;") + "'";
}

// Allow Enter key to generate
document.getElementById("topic").addEventListener("keydown", e => {
  if (e.key === "Enter") generate();
});