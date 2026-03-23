// ─── Supabase init (FIXED: was supabase.createClient which doesn't exist) ────
const { createClient } = supabase;
const db = createClient(
  "https://npqevqiwmsibqswtjjpc.supabase.co",
  "sb_publishable_HR7eoJUtI058I2TQqdif1Q_wtwygTiR"
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

function renderRoadmap(topic, roadmap) {
  const colors = ["p1", "p2", "p3", "p4"];
  const labels = ["Foundation", "Building", "Advanced", "Mastery"];
  const section = document.getElementById("output-section");
  const container = document.getElementById("phases-container");
  const topicEl = document.getElementById("output-topic");

  topicEl.innerHTML = `Roadmap: <span>${escHtml(topic)}</span>`;
  container.innerHTML = "";

  const phases = roadmap.phases || [];
  phases.forEach((phase, i) => {
    const colorClass = colors[i % colors.length];
    const label = labels[i % labels.length];
    const tasks = (phase.tasks || []).map(t =>
      `<div class="task">
        <div class="task-bullet"></div>
        <span>${escHtml(t)}</span>
      </div>`
    ).join("");

    const card = document.createElement("div");
    card.className = `phase-card ${colorClass}`;
    card.innerHTML = `
      <div class="phase-header">
        <div class="phase-num">${String(i + 1).padStart(2, "0")}</div>
        <div class="phase-meta">
          <div class="phase-title">${escHtml(phase.title || `Phase ${i + 1}`)}</div>
          <div class="phase-duration">${escHtml(phase.duration || "")}</div>
        </div>
        <div class="phase-progress">${escHtml(label)}</div>
      </div>
      <div class="phase-body">
        ${phase.description ? `<div class="phase-desc">${escHtml(phase.description)}</div>` : ""}
        <div class="tasks">${tasks}</div>
        ${phase.milestone ? `<div class="milestone"><strong>Milestone:</strong> ${escHtml(phase.milestone)}</div>` : ""}
      </div>
    `;
    container.appendChild(card);
  });

  section.style.display = "block";
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

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

  // Title page
  doc.setFillColor(13, 13, 15);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setTextColor(200, 240, 96);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Pathfinder", margin, 40);
  doc.setTextColor(240, 237, 232);
  doc.setFontSize(18);
  doc.text(doc.splitTextToSize(currentTopic, maxW), margin, 60);
  doc.setTextColor(122, 120, 128);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, margin, 80);

  // Content pages
  doc.addPage();
  y = margin;

  writeLine(currentTopic, 18, "bold", [20, 20, 20]);
  y += 4;

  const phases = currentRoadmap.phases || [];
  phases.forEach((phase, i) => {
    checkPage(20);
    y += 4;

    // Phase header bar
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(margin, y - 4, maxW, 14, 2, 2, "F");
    doc.setTextColor(50, 50, 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Phase ${i + 1}: ${phase.title || ""}`, margin + 4, y + 5);
    if (phase.duration) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(130, 130, 130);
      doc.text(phase.duration, pageW - margin - 4, y + 5, { align: "right" });
    }
    y += 18;

    if (phase.description) writeLine(phase.description, 10, "normal", [80, 80, 80]);
    y += 2;

    (phase.tasks || []).forEach(task => {
      checkPage(8);
      doc.setFillColor(200, 240, 96);
      doc.circle(margin + 2, y - 1, 1.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(task, maxW - 8);
      doc.text(lines, margin + 6, y);
      y += lines.length * 5 + 2;
    });

    if (phase.milestone) {
      checkPage(12);
      y += 2;
      doc.setFillColor(240, 248, 225);
      const mLines = doc.splitTextToSize("✓ " + phase.milestone, maxW - 8);
      doc.roundedRect(margin, y - 4, maxW, mLines.length * 5 + 6, 2, 2, "F");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(60, 110, 20);
      doc.text(mLines, margin + 4, y);
      y += mLines.length * 5 + 8;
    }
  });

  doc.save(`roadmap-${currentTopic.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.pdf`);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function showLoading(on) {
  document.getElementById("loading").style.display = on ? "block" : "none";
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