// ブラウザに保存するときの名前
const STORAGE_KEY = "todos";
const SORT_KEY = "todoSort";

// 分類の一覧。value (work / private) と画面に出す名前の対応表
// 「種類順」で並べるときも、この順番（仕事 → プライベート）になる
const CATEGORIES = {
  work: "仕事",
  private: "プライベート",
};

// HTML の部品を取得する
const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const categorySelect = document.getElementById("todo-category");
const dueInput = document.getElementById("todo-due");
const filters = document.getElementById("filters");
const sortSelect = document.getElementById("sort-select");
const list = document.getElementById("todo-list");
const count = document.getElementById("todo-count");

// ToDo のデータ。1件は次の形
// {
//   id: 1700000000000,
//   text: "旅行の準備",
//   done: false,
//   category: "private",   // "work" か "private"
//   due: "2026-10-20",     // 期限。なしのときは ""
//   subtasks: [{ id: 1700000000001, text: "切符を買う", done: false }],
// }
let todos = loadTodos();

// 今どのタブを表示しているか ("all" / "work" / "private")
let currentFilter = "all";

// 並べ替えの方法 ("added" 追加順 / "due" 期限が近い順 / "category" 種類順)
let currentSort = loadSort();

// 小タスクの入力欄を開いている ToDo の id（保存はしない）
const openSubtaskForms = new Set();

// 画面を作り直したあと、入力欄にカーソルを戻したい小タスク欄の id
let subtaskFormToFocus = null;

// ブラウザ (localStorage) から ToDo を読み込む
function loadTodos() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const loaded = saved ? JSON.parse(saved) : [];
    // 古いバージョンで保存したデータには、あとから追加した項目がないので補う
    return loaded.map((todo) => ({
      ...todo,
      category: todo.category ?? "private",
      due: todo.due ?? "",
      subtasks: todo.subtasks ?? [],
    }));
  } catch {
    return [];
  }
}

// ブラウザ (localStorage) に ToDo を保存する
function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // 保存できない環境でも、画面上では使えるようにしておく
  }
}

function loadSort() {
  try {
    return localStorage.getItem(SORT_KEY) ?? "added";
  } catch {
    return "added";
  }
}

function saveSort() {
  try {
    localStorage.setItem(SORT_KEY, currentSort);
  } catch {
    // 保存できなくても並べ替え自体はできる
  }
}

// ---- 期限の計算 ----

// "2026-10-20" のような文字を、その日の 0 時の日付に変える
function parseDate(text) {
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// 期限までの状態を返す。表示しないときは null
function getDueStatus(todo) {
  if (!todo.due || todo.done) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((parseDate(todo.due) - today) / (24 * 60 * 60 * 1000));

  if (days < 0) return { text: "期限切れ", className: "overdue" };
  if (days === 0) return { text: "今日まで", className: "soon" };
  if (days === 1) return { text: "明日まで", className: "soon" };
  if (days <= 7) return { text: `あと ${days} 日`, className: "" };
  return null;
}

// ---- 並べ替え ----

// 期限が近い順に比べる。期限なしは一番うしろ
function compareDue(a, b) {
  return (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31");
}

// 種類順に比べる。同じ種類の中は期限が近い順
function compareCategory(a, b) {
  const order = Object.keys(CATEGORIES);
  return order.indexOf(a.category) - order.indexOf(b.category) || compareDue(a, b);
}

function sortTodos(items) {
  const sorted = [...items]; // 元の順番（追加順）を壊さないようにコピーしてから並べる
  if (currentSort === "due") sorted.sort(compareDue);
  if (currentSort === "category") sorted.sort(compareCategory);
  return sorted;
}

// ---- 画面を作る ----

// todos の中身をもとに、一覧を作り直す
function render() {
  list.innerHTML = "";

  // 選んでいるタブに合う ToDo だけを取り出して、並べ替える
  const filtered = currentFilter === "all" ? todos : todos.filter((todo) => todo.category === currentFilter);
  const visibleTodos = sortTodos(filtered);

  for (const todo of visibleTodos) {
    list.append(createTodoItem(todo));
  }

  const remaining = visibleTodos.filter((todo) => !todo.done).length;
  count.textContent =
    visibleTodos.length === 0 ? "ToDo はありません" : `残り ${remaining} 件 / 全 ${visibleTodos.length} 件`;

  // 小タスクを追加した直後は、続けて入力できるようにカーソルを戻す
  if (subtaskFormToFocus !== null) {
    document.getElementById(`subtask-input-${subtaskFormToFocus}`)?.focus();
    subtaskFormToFocus = null;
  }
}

// ToDo 1件ぶんの部品を作る
function createTodoItem(todo) {
  const item = document.createElement("li");
  // 例: "todo-item work done" → CSS で分類ごとの色と完了の線が付く
  item.className = `todo-item ${todo.category}${todo.done ? " done" : ""}`;

  // ---- 1行目：チェック・文字・分類の札・削除 ----
  const main = document.createElement("div");
  main.className = "todo-main";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `todo-${todo.id}`;
  checkbox.checked = todo.done;
  checkbox.addEventListener("change", () => updateTodo(todo.id, (t) => ({ ...t, done: !t.done })));

  // ToDo の文字。label にするとクリックでチェックが切り替わる
  // textContent を使うと、入力に HTML が含まれていても安全に表示される
  const label = document.createElement("label");
  label.htmlFor = checkbox.id;
  label.textContent = todo.text;

  // 分類の札（「仕事」「プライベート」）。押すと分類が切り替わる
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = `category-badge ${todo.category}`;
  badge.textContent = CATEGORIES[todo.category];
  badge.title = "押すと分類を切り替えます";
  badge.setAttribute("aria-label", `分類：${CATEGORIES[todo.category]}（押すと切り替え）`);
  badge.addEventListener("click", () =>
    updateTodo(todo.id, (t) => ({ ...t, category: t.category === "work" ? "private" : "work" }))
  );

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", () => deleteTodo(todo.id));

  main.append(checkbox, label, badge, deleteButton);

  // ---- 2行目：期限と小タスクの情報 ----
  const meta = document.createElement("div");
  meta.className = "todo-meta";

  // 期限はここから後で変更できる
  const due = document.createElement("input");
  due.type = "date";
  due.className = "due-input";
  due.value = todo.due;
  due.setAttribute("aria-label", "期限");
  due.addEventListener("change", () => updateTodo(todo.id, (t) => ({ ...t, due: due.value })));

  const dueLabel = document.createElement("span");
  dueLabel.textContent = "期限";
  meta.append(dueLabel, due);

  const status = getDueStatus(todo);
  if (status) {
    const statusLabel = document.createElement("span");
    statusLabel.className = `due-status ${status.className}`;
    statusLabel.textContent = status.text;
    meta.append(statusLabel);
  }

  // 小タスクの進み具合（例: 1/3）
  if (todo.subtasks.length > 0) {
    const doneCount = todo.subtasks.filter((sub) => sub.done).length;
    const progress = document.createElement("span");
    progress.textContent = `小タスク ${doneCount}/${todo.subtasks.length}`;
    meta.append(progress);
  }

  // 小タスクの入力欄を開く / 閉じるボタン
  const isFormOpen = openSubtaskForms.has(todo.id);
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "subtask-toggle";
  toggleButton.textContent = isFormOpen ? "閉じる" : "＋ 小タスク";
  toggleButton.addEventListener("click", () => toggleSubtaskForm(todo.id));
  meta.append(toggleButton);

  item.append(main, meta);

  // ---- 小タスクの一覧 ----
  if (todo.subtasks.length > 0) {
    const subtaskList = document.createElement("ul");
    subtaskList.className = "subtask-list";
    for (const subtask of todo.subtasks) {
      subtaskList.append(createSubtaskItem(todo.id, subtask));
    }
    item.append(subtaskList);
  }

  // ---- 小タスクの入力欄（開いているときだけ） ----
  if (isFormOpen) {
    item.append(createSubtaskForm(todo.id));
  }

  return item;
}

// 小タスク 1件ぶんの部品を作る
function createSubtaskItem(todoId, subtask) {
  const item = document.createElement("li");
  item.className = subtask.done ? "subtask-item done" : "subtask-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `subtask-${subtask.id}`;
  checkbox.checked = subtask.done;
  checkbox.addEventListener("change", () => toggleSubtask(todoId, subtask.id));

  const label = document.createElement("label");
  label.htmlFor = checkbox.id;
  label.textContent = subtask.text;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "subtask-delete";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `小タスク「${subtask.text}」を削除`);
  deleteButton.addEventListener("click", () => deleteSubtask(todoId, subtask.id));

  item.append(checkbox, label, deleteButton);
  return item;
}

// 小タスクの入力欄を作る
function createSubtaskForm(todoId) {
  const subtaskForm = document.createElement("form");
  subtaskForm.className = "subtask-form";

  const subtaskInput = document.createElement("input");
  subtaskInput.type = "text";
  subtaskInput.id = `subtask-input-${todoId}`;
  subtaskInput.placeholder = "小タスクを入力";
  subtaskInput.autocomplete = "off";

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.textContent = "追加";

  subtaskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = subtaskInput.value.trim();
    if (text === "") return;
    subtaskFormToFocus = todoId;
    addSubtask(todoId, text);
  });

  subtaskForm.append(subtaskInput, addButton);
  return subtaskForm;
}

// ---- データを変える処理 ----
// どれも「todos を変える → 保存する → 画面を作り直す」の流れ

// id が一致する ToDo を、update 関数で作った新しい ToDo に置き換える
function updateTodo(id, update) {
  todos = todos.map((todo) => (todo.id === id ? update(todo) : todo));
  saveTodos();
  render();
}

function addTodo(text, category, due) {
  todos.push({ id: Date.now(), text, done: false, category, due, subtasks: [] });
  saveTodos();
  render();
}

function deleteTodo(id) {
  todos = todos.filter((todo) => todo.id !== id);
  openSubtaskForms.delete(id);
  saveTodos();
  render();
}

function addSubtask(todoId, text) {
  updateTodo(todoId, (todo) => ({
    ...todo,
    subtasks: [...todo.subtasks, { id: Date.now(), text, done: false }],
  }));
}

function toggleSubtask(todoId, subtaskId) {
  updateTodo(todoId, (todo) => ({
    ...todo,
    subtasks: todo.subtasks.map((sub) => (sub.id === subtaskId ? { ...sub, done: !sub.done } : sub)),
  }));
}

function deleteSubtask(todoId, subtaskId) {
  updateTodo(todoId, (todo) => ({
    ...todo,
    subtasks: todo.subtasks.filter((sub) => sub.id !== subtaskId),
  }));
}

// 小タスクの入力欄を開く / 閉じる
function toggleSubtaskForm(todoId) {
  if (openSubtaskForms.has(todoId)) {
    openSubtaskForms.delete(todoId);
  } else {
    openSubtaskForms.add(todoId);
    subtaskFormToFocus = todoId;
  }
  render();
}

// 表示するタブを切り替える
function setFilter(filter) {
  currentFilter = filter;
  // 押されたタブにだけ active クラスを付ける（CSS で塗りつぶされる）
  for (const button of filters.querySelectorAll(".filter-button")) {
    button.classList.toggle("active", button.dataset.filter === filter);
  }
  // 仕事 / プライベートのタブを見ているときは、追加する分類もそれに合わせる
  if (filter !== "all") categorySelect.value = filter;
  render();
}

// ---- ボタンや入力欄の操作を受け取る ----

// 追加ボタン (または Enter キー) が押されたとき
form.addEventListener("submit", (event) => {
  event.preventDefault(); // ページの再読み込みを止める
  const text = input.value.trim();
  if (text === "") return;
  addTodo(text, categorySelect.value, dueInput.value);
  input.value = "";
  dueInput.value = "";
  voiceStatus.textContent = "";
  input.focus();
});

// タブが押されたとき。3つのボタンをまとめて親の要素で受け取る
filters.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-button");
  if (button) setFilter(button.dataset.filter);
});

// 並べ替えが変わったとき
sortSelect.value = currentSort;
sortSelect.addEventListener("change", () => {
  currentSort = sortSelect.value;
  saveSort();
  render();
});

// ---- 音声入力 ----
// ブラウザに入っている音声認識の機能を使う。Safari や Chrome では名前に webkit が付いている
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceButton = document.getElementById("voice-button");
const voiceStatus = document.getElementById("voice-status");
let recognition = null; // 聞き取り中だけ中身が入る

function startVoiceInput() {
  if (!SpeechRecognition) {
    voiceStatus.textContent = "このブラウザでは音声入力が使えません（Chrome か Safari の https のページで使えます）";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ja-JP"; // 日本語で聞き取る
  recognition.interimResults = true; // 話している途中の文字も表示する

  // 聞き取った文字を入力欄に入れる
  recognition.addEventListener("result", (event) => {
    const text = Array.from(event.results, (result) => result[0].transcript).join("");
    input.value = text;
  });

  // うまくいかなかったとき
  recognition.addEventListener("error", (event) => {
    voiceStatus.textContent =
      event.error === "not-allowed" ? "マイクの使用が許可されていません" : "うまく聞き取れませんでした";
  });

  // 聞き取りが終わったとき（話し終わると自動で終わる）
  recognition.addEventListener("end", () => {
    recognition = null;
    voiceButton.classList.remove("listening");
    if (voiceStatus.textContent === "聞き取り中…") {
      voiceStatus.textContent = input.value ? "内容を確認して「追加」を押してください" : "";
    }
    input.focus();
  });

  recognition.start();
  voiceButton.classList.add("listening");
  voiceStatus.textContent = "聞き取り中…";
}

// 🎤 ボタン：押すと聞き取り開始、聞き取り中にもう一度押すと止める
voiceButton.addEventListener("click", () => {
  if (recognition) {
    recognition.stop();
  } else {
    startVoiceInput();
  }
});

// 最初に一度表示する
render();
