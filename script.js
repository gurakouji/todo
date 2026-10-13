// ブラウザに保存するときの名前
const STORAGE_KEY = "todos";

// 分類の一覧。value (work / private) と画面に出す名前の対応表
const CATEGORIES = {
  work: "仕事",
  private: "プライベート",
};

// HTML の部品を取得する
const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const categorySelect = document.getElementById("todo-category");
const filters = document.getElementById("filters");
const list = document.getElementById("todo-list");
const count = document.getElementById("todo-count");

// ToDo のデータ。1件は { id, text, done, category } の形
// 例: { id: 1700000000000, text: "牛乳を買う", done: false, category: "private" }
let todos = loadTodos();

// 今どのタブを表示しているか ("all" / "work" / "private")
let currentFilter = "all";

// ブラウザ (localStorage) から ToDo を読み込む
function loadTodos() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const loaded = saved ? JSON.parse(saved) : [];
    // 分類を追加する前に保存されたデータには category がないので、「プライベート」として扱う
    return loaded.map((todo) => ({ ...todo, category: todo.category ?? "private" }));
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

// todos の中身をもとに、一覧を作り直す
function render() {
  list.innerHTML = "";

  // 選んでいるタブに合う ToDo だけを取り出す
  const visibleTodos = currentFilter === "all" ? todos : todos.filter((todo) => todo.category === currentFilter);

  for (const todo of visibleTodos) {
    const item = document.createElement("li");
    // 例: "todo-item work done" → CSS で分類ごとの色と完了の線が付く
    item.className = `todo-item ${todo.category}${todo.done ? " done" : ""}`;

    // 完了チェックボックス
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `todo-${todo.id}`;
    checkbox.checked = todo.done;
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

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
    badge.addEventListener("click", () => changeCategory(todo.id));

    // 削除ボタン
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => deleteTodo(todo.id));

    item.append(checkbox, label, badge, deleteButton);
    list.append(item);
  }

  const remaining = visibleTodos.filter((todo) => !todo.done).length;
  count.textContent =
    visibleTodos.length === 0 ? "ToDo はありません" : `残り ${remaining} 件 / 全 ${visibleTodos.length} 件`;
}

// ToDo を追加する
function addTodo(text, category) {
  todos.push({ id: Date.now(), text, done: false, category });
  saveTodos();
  render();
}

// 完了 / 未完了を切り替える
function toggleTodo(id) {
  todos = todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
  saveTodos();
  render();
}

// 分類を切り替える（仕事 ⇔ プライベート）
function changeCategory(id) {
  todos = todos.map((todo) =>
    todo.id === id ? { ...todo, category: todo.category === "work" ? "private" : "work" } : todo
  );
  saveTodos();
  render();
}

// ToDo を削除する
function deleteTodo(id) {
  todos = todos.filter((todo) => todo.id !== id);
  saveTodos();
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

// 追加ボタン (または Enter キー) が押されたとき
form.addEventListener("submit", (event) => {
  event.preventDefault(); // ページの再読み込みを止める
  const text = input.value.trim();
  if (text === "") return;
  addTodo(text, categorySelect.value);
  input.value = "";
  voiceStatus.textContent = "";
  input.focus();
});

// タブが押されたとき。3つのボタンをまとめて親の要素で受け取る
filters.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-button");
  if (button) setFilter(button.dataset.filter);
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
