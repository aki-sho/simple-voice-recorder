use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::{State, WebviewUrl, WebviewWindowBuilder};

const DISPLAY_NAME: &str = "Simple Voice Recorder";
const PORTABLE_DATA_DIRECTORY: &str = "Simple-Voice-Recorder-PortableData";

#[derive(Clone)]
struct AppPaths {
    root: PathBuf,
    portable: bool,
}

impl AppPaths {
    fn detect() -> Result<Self, String> {
        if cfg!(feature = "portable") {
            let executable = env::current_exe()
                .map_err(|error| format!("アプリの保存場所を確認できませんでした: {error}"))?;
            let executable_directory = executable
                .parent()
                .ok_or_else(|| "アプリの保存場所を確認できませんでした。".to_string())?;
            return Ok(Self {
                root: executable_directory.join(PORTABLE_DATA_DIRECTORY),
                portable: true,
            });
        }

        let app_data = env::var_os("APPDATA")
            .ok_or_else(|| "AppDataフォルダを確認できませんでした。".to_string())?;
        Ok(Self {
            root: PathBuf::from(app_data).join(DISPLAY_NAME),
            portable: false,
        })
    }

    fn prepare(&self) -> Result<(), String> {
        fs::create_dir_all(&self.root)
            .map_err(|error| format!("設定フォルダを作成できませんでした: {error}"))?;
        fs::create_dir_all(self.webview_data())
            .map_err(|error| format!("WebViewデータフォルダを作成できませんでした: {error}"))?;

        if self.portable && !self.settings_file().exists() {
            let legacy_settings = env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf))
                .map(|path| path.join("data").join("settings.json"));
            if let Some(legacy_settings) = legacy_settings.filter(|path| path.is_file()) {
                fs::copy(legacy_settings, self.settings_file())
                    .map_err(|error| format!("以前の設定を移行できませんでした: {error}"))?;
            }
        }

        Ok(())
    }

    fn settings_file(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    fn webview_data(&self) -> PathBuf {
        self.root.join("WebView")
    }
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    save_folder: Option<String>,
    default_format: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingFile {
    name: String,
    size: u64,
    modified_at: u64,
}

fn read_settings(paths: &AppPaths) -> Result<Settings, String> {
    let path = paths.settings_file();
    if !path.exists() {
        return Ok(Settings::default());
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("設定ファイルを読み込めませんでした: {error}"))?;
    serde_json::from_str(&text)
        .map_err(|error| format!("設定ファイルの形式が正しくありません: {error}"))
}

fn write_settings(paths: &AppPaths, settings: &Settings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("設定を変換できませんでした: {error}"))?;
    fs::write(paths.settings_file(), text)
        .map_err(|error| format!("設定を保存できませんでした: {error}"))
}

fn configured_folder(paths: &AppPaths) -> Result<PathBuf, String> {
    let folder = read_settings(paths)?
        .save_folder
        .ok_or_else(|| "保存先フォルダが設定されていません。".to_string())?;
    let path = PathBuf::from(folder);
    if !path.exists() {
        return Err(
            "設定されている保存先フォルダが存在しません。保存先を選び直してください。".to_string(),
        );
    }
    if !path.is_dir() {
        return Err(
            "設定されている保存先はフォルダではありません。保存先を選び直してください。"
                .to_string(),
        );
    }
    Ok(path)
}

fn safe_recording_path(folder: &Path, file_name: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(file_name);
    let extension = candidate.extension().and_then(|value| value.to_str());
    let is_recording = candidate.components().count() == 1
        && matches!(extension, Some("webm") | Some("mp3"))
        && !file_name.is_empty();
    if !is_recording {
        return Err("録音ファイル名が正しくありません。".to_string());
    }
    Ok(folder.join(candidate))
}

#[tauri::command]
fn get_save_folder(paths: State<'_, AppPaths>) -> Result<Option<String>, String> {
    Ok(read_settings(&paths)?.save_folder)
}

#[tauri::command]
fn get_default_format(paths: State<'_, AppPaths>) -> Result<String, String> {
    let format = read_settings(&paths)?
        .default_format
        .unwrap_or_else(|| "webm".to_string());
    Ok(if format == "mp3" { "mp3" } else { "webm" }.to_string())
}

#[tauri::command]
fn set_default_format(paths: State<'_, AppPaths>, format: String) -> Result<(), String> {
    if !matches!(format.as_str(), "webm" | "mp3") {
        return Err("保存形式が正しくありません。".to_string());
    }
    let mut settings = read_settings(&paths)?;
    settings.default_format = Some(format);
    write_settings(&paths, &settings)
}

#[tauri::command]
fn choose_save_folder(paths: State<'_, AppPaths>) -> Result<Option<String>, String> {
    let selected = rfd::FileDialog::new()
        .set_title("録音ファイルの保存先を選択")
        .pick_folder();

    let Some(path) = selected else {
        return Ok(None);
    };
    if !path.exists() || !path.is_dir() {
        return Err("選択した保存先フォルダが存在しません。".to_string());
    }

    let path_text = path.to_string_lossy().into_owned();
    let mut settings = read_settings(&paths)?;
    settings.save_folder = Some(path_text.clone());
    write_settings(&paths, &settings)?;
    Ok(Some(path_text))
}

#[tauri::command]
fn save_recording(
    paths: State<'_, AppPaths>,
    file_name: String,
    data: Vec<u8>,
) -> Result<(), String> {
    if data.is_empty() {
        return Err("録音データが空のため保存できませんでした。".to_string());
    }
    let folder = configured_folder(&paths)?;
    let path = safe_recording_path(&folder, &file_name)?;
    fs::write(path, data).map_err(|error| format!("録音ファイルを保存できませんでした: {error}"))
}

#[tauri::command]
fn list_recordings(paths: State<'_, AppPaths>) -> Result<Vec<RecordingFile>, String> {
    let folder = configured_folder(&paths)?;
    let entries = fs::read_dir(folder)
        .map_err(|error| format!("保存先フォルダを読み込めませんでした: {error}"))?;
    let mut recordings = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let extension = path.extension().and_then(|value| value.to_str());
        if !path.is_file() || !matches!(extension, Some("webm") | Some("mp3")) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        recordings.push(RecordingFile {
            name: entry.file_name().to_string_lossy().into_owned(),
            size: metadata.len(),
            modified_at,
        });
    }

    recordings.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    Ok(recordings)
}

#[tauri::command]
fn load_recording(paths: State<'_, AppPaths>, file_name: String) -> Result<Vec<u8>, String> {
    let folder = configured_folder(&paths)?;
    let path = safe_recording_path(&folder, &file_name)?;
    fs::read(path).map_err(|error| format!("録音ファイルを読み込めませんでした: {error}"))
}

#[tauri::command]
fn delete_recording(paths: State<'_, AppPaths>, file_name: String) -> Result<(), String> {
    let folder = configured_folder(&paths)?;
    let path = safe_recording_path(&folder, &file_name)?;
    if !path.exists() {
        return Err("削除する録音ファイルが見つかりません。".to_string());
    }
    fs::remove_file(path).map_err(|error| format!("録音ファイルを削除できませんでした: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let paths = AppPaths::detect().expect("failed to resolve Simple Voice Recorder data path");
    paths
        .prepare()
        .expect("failed to prepare Simple Voice Recorder data path");
    let webview_data = paths.webview_data();

    tauri::Builder::default()
        .manage(paths)
        .setup(move |app| {
            let mut window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title(DISPLAY_NAME)
                    .inner_size(900.0, 780.0)
                    .min_inner_size(600.0, 620.0)
                    .resizable(true)
                    .center()
                    .data_directory(webview_data.clone());

            if let Some(icon) = app.default_window_icon() {
                window = window.icon(icon.clone())?;
            }

            window.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_save_folder,
            get_default_format,
            set_default_format,
            choose_save_folder,
            save_recording,
            list_recordings,
            load_recording,
            delete_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running Simple Voice Recorder");
}
