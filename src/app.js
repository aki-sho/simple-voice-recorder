const invoke = window.__TAURI__?.core?.invoke;

const elements = {
  folderPath: document.querySelector("#folder-path"),
  chooseFolderButton: document.querySelector("#choose-folder-button"),
  saveFormat: document.querySelector("#save-format"),
  formatHint: document.querySelector("#format-hint"),
  startButton: document.querySelector("#start-button"),
  stopButton: document.querySelector("#stop-button"),
  recordingStatus: document.querySelector("#recording-status"),
  recordingTime: document.querySelector("#recording-time"),
  recordingState: document.querySelector(".recording-state"),
  message: document.querySelector("#message"),
  refreshButton: document.querySelector("#refresh-button"),
  recordingsEmpty: document.querySelector("#recordings-empty"),
  recordingsList: document.querySelector("#recordings-list"),
  selectedFile: document.querySelector("#selected-file"),
  audioPlayer: document.querySelector("#audio-player"),
  currentTime: document.querySelector("#current-time"),
  duration: document.querySelector("#duration"),
  seekBar: document.querySelector("#seek-bar"),
  playButton: document.querySelector("#play-button"),
  pauseButton: document.querySelector("#pause-button"),
  playerStopButton: document.querySelector("#player-stop-button"),
};

let saveFolder = null;
let defaultFormat = "webm";
let mediaRecorder = null;
let mediaStream = null;
let recordedChunks = [];
let recordingFormat = "webm";
let recordingActive = false;
let audioContext = null;
let audioSource = null;
let audioProcessor = null;
let silentGain = null;
let mp3Encoder = null;
let mp3Chunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let currentAudioUrl = null;
let selectedFileName = null;

function showMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.classList.toggle("error", isError);
  elements.message.hidden = false;
}

function hideMessage() {
  elements.message.hidden = true;
}

function errorText(error) {
  if (typeof error === "string") return error;
  return error?.message || String(error);
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModifiedAt(epochSeconds) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(epochSeconds * 1000));
}

function createRecordingFileName(format) {
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join("");
  return `recording_${date}_${time}.${format}`;
}

function setRecordingUi(isRecording) {
  recordingActive = isRecording;
  elements.startButton.disabled = isRecording;
  elements.stopButton.disabled = !isRecording;
  elements.chooseFolderButton.disabled = isRecording;
  elements.saveFormat.disabled = isRecording;
  elements.recordingState.classList.toggle("active", isRecording);
  elements.recordingStatus.textContent = isRecording ? "録音中" : "待機中";
}

function updateFormatHint() {
  const label = defaultFormat === "mp3" ? "MP3" : "WebM";
  elements.formatHint.textContent = `録音停止後、${label}形式で自動保存されます。`;
}

function updateFolderDisplay() {
  elements.folderPath.textContent = saveFolder || "未設定";
}

function startRecordingTimer() {
  recordingStartedAt = Date.now();
  elements.recordingTime.textContent = "00:00";
  recordingTimer = window.setInterval(() => {
    elements.recordingTime.textContent = formatClock((Date.now() - recordingStartedAt) / 1000);
  }, 250);
}

function stopRecordingTimer() {
  window.clearInterval(recordingTimer);
  recordingTimer = null;
}

function releaseMicrophone() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }
  mediaStream = null;
  mediaRecorder = null;
  if (audioProcessor) {
    audioProcessor.onaudioprocess = null;
    audioProcessor.disconnect();
  }
  audioSource?.disconnect();
  silentGain?.disconnect();
  audioContext?.close();
  audioProcessor = null;
  audioSource = null;
  silentGain = null;
  audioContext = null;
  mp3Encoder = null;
}

function floatToInt16(samples) {
  const output = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    output[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return output;
}

function startMp3Encoder(stream) {
  if (!window.lamejs?.Mp3Encoder) {
    throw new Error("MP3エンコーダーを読み込めませんでした。");
  }

  audioContext = new AudioContext();
  audioSource = audioContext.createMediaStreamSource(stream);
  audioProcessor = audioContext.createScriptProcessor(4096, audioSource.channelCount, 1);
  silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  mp3Encoder = new window.lamejs.Mp3Encoder(1, audioContext.sampleRate, 128);
  mp3Chunks = [];

  audioProcessor.onaudioprocess = (event) => {
    const input = event.inputBuffer;
    const mono = new Float32Array(input.length);
    for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
      const channelData = input.getChannelData(channel);
      for (let index = 0; index < channelData.length; index += 1) {
        mono[index] += channelData[index] / input.numberOfChannels;
      }
    }
    const encoded = mp3Encoder.encodeBuffer(floatToInt16(mono));
    if (encoded.length > 0) mp3Chunks.push(new Uint8Array(encoded));
  };

  audioSource.connect(audioProcessor);
  audioProcessor.connect(silentGain);
  silentGain.connect(audioContext.destination);
}

async function chooseSaveFolder() {
  hideMessage();
  try {
    const selected = await invoke("choose_save_folder");
    if (selected) {
      saveFolder = selected;
      updateFolderDisplay();
      showMessage("保存先フォルダを設定しました。");
      await refreshRecordings();
    }
    return selected;
  } catch (error) {
    showMessage(errorText(error), true);
    return null;
  }
}

async function startRecording() {
  hideMessage();

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showMessage("この環境ではマイク録音機能を利用できません。WindowsとWebView2を更新してください。", true);
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingFormat = defaultFormat;
    if (recordingFormat === "mp3") {
      startMp3Encoder(mediaStream);
    } else {
      const preferredMimeType = "audio/webm;codecs=opus";
      const options = MediaRecorder.isTypeSupported(preferredMimeType)
        ? { mimeType: preferredMimeType }
        : undefined;
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(mediaStream, options);
      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recordedChunks.push(event.data);
      });
      mediaRecorder.addEventListener("stop", saveWebmRecording, { once: true });
      mediaRecorder.start(1000);
    }
    setRecordingUi(true);
    startRecordingTimer();
  } catch (error) {
    releaseMicrophone();
    const name = error?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      showMessage("マイクへのアクセスが許可されませんでした。Windowsのマイク設定を確認してください。", true);
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      showMessage("使用できるマイクが見つかりません。マイクの接続を確認してください。", true);
    } else {
      showMessage(`録音を開始できませんでした: ${errorText(error)}`, true);
    }
  }
}

function stopRecording() {
  if (!recordingActive) return;
  elements.stopButton.disabled = true;
  elements.recordingStatus.textContent = "保存中...";
  stopRecordingTimer();
  if (recordingFormat === "mp3") {
    saveMp3Recording();
  } else if (mediaRecorder?.state !== "inactive") {
    mediaRecorder.stop();
  }
}

async function saveWebmRecording() {
  const mimeType = mediaRecorder?.mimeType || "audio/webm";
  const blob = new Blob(recordedChunks, { type: mimeType });
  await saveRecordingBytes(new Uint8Array(await blob.arrayBuffer()), "webm");
}

async function saveMp3Recording() {
  try {
    const finalChunk = mp3Encoder?.flush();
    if (finalChunk?.length) mp3Chunks.push(new Uint8Array(finalChunk));
    const blob = new Blob(mp3Chunks, { type: "audio/mpeg" });
    await saveRecordingBytes(new Uint8Array(await blob.arrayBuffer()), "mp3");
  } catch (error) {
    showMessage(`MP3の作成に失敗しました: ${errorText(error)}`, true);
  } finally {
    mp3Chunks = [];
    releaseMicrophone();
    setRecordingUi(false);
  }
}

async function saveRecordingBytes(bytes, format) {
  try {
    if (!saveFolder) {
      showMessage("保存先が未設定です。録音ファイルの保存先を選択してください。", true);
      const selected = await chooseSaveFolder();
      if (!selected) {
        showMessage("保存先が選択されなかったため、録音は保存されませんでした。", true);
        return;
      }
    }

    const fileName = createRecordingFileName(format);
    await invoke("save_recording", { fileName, data: Array.from(bytes) });
    showMessage(`${fileName} を保存しました。`);
    await refreshRecordings();
  } catch (error) {
    showMessage(errorText(error), true);
  } finally {
    if (format === "webm") {
      recordedChunks = [];
      releaseMicrophone();
      setRecordingUi(false);
    }
  }
}

async function refreshRecordings() {
  elements.recordingsList.replaceChildren();

  if (!saveFolder) {
    elements.recordingsEmpty.textContent = "保存先フォルダを設定してください。";
    elements.recordingsEmpty.hidden = false;
    return;
  }

  try {
    const files = await invoke("list_recordings");
    elements.recordingsEmpty.textContent = "保存済みの録音はありません。";
    elements.recordingsEmpty.hidden = files.length > 0;

    for (const file of files) {
      const item = document.createElement("li");
      item.className = "recording-item";
      item.classList.toggle("selected", file.name === selectedFileName);

      const info = document.createElement("div");
      info.className = "recording-info";
      const name = document.createElement("div");
      name.className = "recording-name";
      name.textContent = file.name;
      name.title = file.name;
      const meta = document.createElement("div");
      meta.className = "recording-meta";
      meta.textContent = `${formatModifiedAt(file.modifiedAt)} / ${formatFileSize(file.size)}`;
      info.append(name, meta);

      const selectButton = document.createElement("button");
      selectButton.className = "item-button";
      selectButton.type = "button";
      selectButton.textContent = "選択";
      selectButton.addEventListener("click", () => selectRecording(file.name));

      const deleteButton = document.createElement("button");
      deleteButton.className = "item-button delete";
      deleteButton.type = "button";
      deleteButton.textContent = "削除";
      deleteButton.addEventListener("click", () => deleteRecording(file.name));

      item.append(info, selectButton, deleteButton);
      elements.recordingsList.append(item);
    }
  } catch (error) {
    elements.recordingsEmpty.hidden = false;
    elements.recordingsEmpty.textContent = "一覧を読み込めませんでした。";
    showMessage(errorText(error), true);
  }
}

function resetPlayer() {
  elements.audioPlayer.pause();
  elements.audioPlayer.removeAttribute("src");
  elements.audioPlayer.load();
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = null;
  selectedFileName = null;
  elements.selectedFile.textContent = "ファイルが選択されていません";
  elements.currentTime.textContent = "00:00";
  elements.duration.textContent = "00:00";
  elements.seekBar.value = "0";
  elements.seekBar.disabled = true;
  elements.playButton.disabled = true;
  elements.pauseButton.disabled = true;
  elements.playerStopButton.disabled = true;
}

async function selectRecording(fileName) {
  hideMessage();
  try {
    elements.selectedFile.textContent = "読み込み中...";
    const bytes = await invoke("load_recording", { fileName });
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    const mimeType = fileName.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/webm";
    currentAudioUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType }));
    selectedFileName = fileName;
    elements.audioPlayer.src = currentAudioUrl;
    elements.selectedFile.textContent = fileName;
    elements.playButton.disabled = false;
    elements.pauseButton.disabled = false;
    elements.playerStopButton.disabled = false;
    elements.seekBar.disabled = false;
    await refreshRecordings();
  } catch (error) {
    resetPlayer();
    showMessage(errorText(error), true);
  }
}

async function deleteRecording(fileName) {
  const confirmed = window.confirm(`${fileName} を削除しますか？\nこの操作は元に戻せません。`);
  if (!confirmed) return;

  try {
    await invoke("delete_recording", { fileName });
    if (selectedFileName === fileName) resetPlayer();
    showMessage(`${fileName} を削除しました。`);
    await refreshRecordings();
  } catch (error) {
    showMessage(errorText(error), true);
  }
}

elements.chooseFolderButton.addEventListener("click", chooseSaveFolder);
elements.saveFormat.addEventListener("change", async () => {
  const previousFormat = defaultFormat;
  defaultFormat = elements.saveFormat.value;
  updateFormatHint();
  try {
    await invoke("set_default_format", { format: defaultFormat });
    showMessage(`既定の保存形式を${defaultFormat === "mp3" ? "MP3" : "WebM"}に設定しました。`);
  } catch (error) {
    defaultFormat = previousFormat;
    elements.saveFormat.value = defaultFormat;
    updateFormatHint();
    showMessage(errorText(error), true);
  }
});
elements.startButton.addEventListener("click", startRecording);
elements.stopButton.addEventListener("click", stopRecording);
elements.refreshButton.addEventListener("click", refreshRecordings);
elements.playButton.addEventListener("click", () => elements.audioPlayer.play());
elements.pauseButton.addEventListener("click", () => elements.audioPlayer.pause());
elements.playerStopButton.addEventListener("click", () => {
  elements.audioPlayer.pause();
  elements.audioPlayer.currentTime = 0;
});
elements.seekBar.addEventListener("input", () => {
  if (Number.isFinite(elements.audioPlayer.duration)) {
    elements.audioPlayer.currentTime = (Number(elements.seekBar.value) / 100) * elements.audioPlayer.duration;
  }
});
elements.audioPlayer.addEventListener("loadedmetadata", () => {
  elements.duration.textContent = formatClock(elements.audioPlayer.duration);
});
elements.audioPlayer.addEventListener("timeupdate", () => {
  elements.currentTime.textContent = formatClock(elements.audioPlayer.currentTime);
  if (Number.isFinite(elements.audioPlayer.duration) && elements.audioPlayer.duration > 0) {
    elements.seekBar.value = String((elements.audioPlayer.currentTime / elements.audioPlayer.duration) * 100);
  }
});
elements.audioPlayer.addEventListener("ended", () => {
  elements.audioPlayer.currentTime = 0;
});

async function initialize() {
  setRecordingUi(false);
  if (!invoke) {
    showMessage("この画面はTauriアプリ内で実行してください。", true);
    elements.startButton.disabled = true;
    elements.chooseFolderButton.disabled = true;
    return;
  }
  try {
    [saveFolder, defaultFormat] = await Promise.all([
      invoke("get_save_folder"),
      invoke("get_default_format"),
    ]);
    elements.saveFormat.value = defaultFormat;
    updateFormatHint();
    updateFolderDisplay();
    await refreshRecordings();
  } catch (error) {
    showMessage(errorText(error), true);
  }
}

initialize();
