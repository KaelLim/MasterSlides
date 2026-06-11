const params = new URLSearchParams(location.search);
const docId = params.get("src");
const $form = document.getElementById("edit-form") as HTMLFormElement;
const $status = document.getElementById("status") as HTMLElement;
const $date = document.getElementById("presentation-date") as HTMLInputElement;
const $title = document.getElementById("title") as HTMLInputElement;
const $list = document.getElementById("reporter-list") as HTMLUListElement;
const $add = document.getElementById("add-reporter") as HTMLButtonElement;
const $save = document.getElementById("save-btn") as HTMLButtonElement;

interface EditData {
  presentation_date: string;
  title: string;
  unit_report: string[];
}

function showStatus(msg: string, kind: string = "info"): void {
  $status.hidden = false;
  $status.textContent = msg;
  $status.dataset.kind = kind;
}

function clearStatus(): void {
  $status.hidden = true;
  $status.textContent = "";
}

function reporterRow(value: string = ""): HTMLLIElement {
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
  li.appendChild(input);
  li.appendChild(remove);
  return li;
}

function updateSaveState(): void {
  const reporters = [...$list.querySelectorAll<HTMLInputElement>("input")]
    .map((i) => i.value.trim())
    .filter((v) => v.length > 0);
  const ok =
    !!$date.value &&
    $title.value.trim().length > 0 &&
    reporters.length > 0;
  $save.disabled = !ok;
}

function seedForm(data: EditData): void {
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

$form.addEventListener("submit", async (e: SubmitEvent) => {
  e.preventDefault();
  const unit_report = [...$list.querySelectorAll<HTMLInputElement>("input")]
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
    const res = await fetch(`/api/edit/${encodeURIComponent(docId!)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" })) as { error?: string };
      showStatus(`儲存失敗：${body.error || res.status}`, "error");
      $save.disabled = false;
      return;
    }
    location.href = `/slides/?src=${encodeURIComponent(docId!)}`;
  } catch (err) {
    showStatus(`儲存失敗：${(err as Error).message}`, "error");
    $save.disabled = false;
  }
});

async function init(): Promise<void> {
  if (!docId) {
    showStatus("缺少 ?src=<doc_id> 參數", "error");
    return;
  }
  showStatus("載入中…");
  try {
    const res = await fetch(`/api/edit/${encodeURIComponent(docId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as EditData;
    seedForm(data);
    clearStatus();
    $form.hidden = false;
  } catch (err) {
    showStatus(`無法載入：${(err as Error).message}`, "error");
  }
}

init();
