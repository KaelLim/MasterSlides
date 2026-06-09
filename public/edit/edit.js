const params = new URLSearchParams(location.search);
const docId = params.get("src");
const $form = document.getElementById("edit-form");
const $status = document.getElementById("status");
const $date = document.getElementById("presentation-date");
const $title = document.getElementById("title");
const $list = document.getElementById("reporter-list");
const $add = document.getElementById("add-reporter");
const $save = document.getElementById("save-btn");

function showStatus(msg, kind = "info") {
  $status.hidden = false;
  $status.textContent = msg;
  $status.dataset.kind = kind;
}

function clearStatus() {
  $status.hidden = true;
  $status.textContent = "";
}

function reporterRow(value = "") {
  const li = document.createElement("li");
  li.className = "reporter-row";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.maxLength = 60;
  input.addEventListener("input", updateSaveState);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ghost-btn ghost-btn--icon";
  remove.textContent = "−";
  remove.addEventListener("click", () => {
    if ($list.children.length <= 1) return;
    li.remove();
    updateSaveState();
  });
  li.append(input, remove);
  return li;
}

function updateSaveState() {
  const reporters = [...$list.querySelectorAll("input")]
    .map((i) => i.value.trim())
    .filter((v) => v.length > 0);
  const ok =
    !!$date.value &&
    $title.value.trim().length > 0 &&
    reporters.length > 0;
  $save.disabled = !ok;
}

function seedForm(data) {
  $date.value = data.presentation_date;
  $title.value = data.title;
  $list.innerHTML = "";
  const initial = data.unit_report.length > 0 ? data.unit_report : [""];
  for (const name of initial) $list.appendChild(reporterRow(name));
  updateSaveState();
}

$add.addEventListener("click", () => {
  $list.appendChild(reporterRow());
  updateSaveState();
});
$date.addEventListener("input", updateSaveState);
$title.addEventListener("input", updateSaveState);

$form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const unit_report = [...$list.querySelectorAll("input")]
    .map((i) => i.value.trim())
    .filter((v) => v.length > 0);
  const payload = {
    presentation_date: $date.value,
    title: $title.value.trim(),
    unit_report,
  };
  $save.disabled = true;
  showStatus("儲存中…");
  try {
    const res = await fetch(`/api/edit/${encodeURIComponent(docId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      showStatus(`儲存失敗：${body.error || res.status}`, "error");
      $save.disabled = false;
      return;
    }
    location.href = `/slides/?src=${encodeURIComponent(docId)}`;
  } catch (err) {
    showStatus(`儲存失敗：${err.message}`, "error");
    $save.disabled = false;
  }
});

async function init() {
  if (!docId) {
    showStatus("缺少 ?src=<doc_id> 參數", "error");
    return;
  }
  showStatus("載入中…");
  try {
    const res = await fetch(`/api/edit/${encodeURIComponent(docId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    seedForm(data);
    clearStatus();
    $form.hidden = false;
  } catch (err) {
    showStatus(`無法載入：${err.message}`, "error");
  }
}

init();
