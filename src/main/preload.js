// preload.js
const { contextBridge, ipcRenderer, shell } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Timer controls
  startTimer: () => ipcRenderer.send("start-timer"),
  pauseTimer: () => ipcRenderer.send("pause-timer"),
  resetTimer: () => ipcRenderer.send("reset-timer"),
  startBreak: () => ipcRenderer.send("start-break"),
  endBreak: () => ipcRenderer.send("end-break"),
  skipBreak: () => ipcRenderer.send("skip-break"),
  delayBreak: (minutes) => ipcRenderer.send("delay-break", minutes),

  // Timer sync
  updateTimer: (seconds) => ipcRenderer.send("update-timer", seconds),
  onTimerRestart: (callback) => ipcRenderer.on("restart-timer", callback),
  onTimerUpdate: (callback) => {
    ipcRenderer.removeAllListeners("timer-update");
    ipcRenderer.on("timer-update", (event, data) => callback(event, data));
  },

  // Break state listeners
  onBreakSkipped: (callback) => ipcRenderer.on("break-skipped", callback),
  onBreakStateChange: (callback) => ipcRenderer.on("break-state-change", callback),
  onBreakEnd: (callback) => ipcRenderer.on("break-end", callback),

  // Window controls
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  maximizeWindow: () => ipcRenderer.send("window-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  showMain: () => ipcRenderer.send("mainWindow-maximize"),
  lockScreen: () => ipcRenderer.send("lock-screen"),

  // Progress updates
  updateBreakProgress: (data) => ipcRenderer.send("update-break-progress", data),
  getBreakProgress: () => ipcRenderer.invoke("get-break-progress"),

  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.send("save-settings", settings),
  getBreakDuration: () => ipcRenderer.invoke("get-break-duration"),
  onSettingsUpdated: (callback) => ipcRenderer.on("settings-updated", (event, data) => callback(event, data)),

  // Navigation
  onShowSettings: (callback) => ipcRenderer.on("show-settings", callback),

  // Widget
  toggleWidget: () => ipcRenderer.send("toggle-widget"),

  // Notifications
  notifyBreaktime: () => ipcRenderer.send("notify-breaktime"),
  playNotification: () => ipcRenderer.send("play-notification"),
  onTimeSync: (callback) => ipcRenderer.on("sync-time", callback),

  // Custom sound upload
  uploadSound: () => ipcRenderer.invoke("upload-sound"),

  // Custom break background image upload
  uploadBreakImage: () => ipcRenderer.invoke("upload-break-image"),

  // Overtime nudge
  dismissOvertimeNudge: () => ipcRenderer.send("dismiss-overtime-nudge"),
  getOvertimeInfo: () => ipcRenderer.invoke("get-overtime-info"),

  // Automations
  saveAutomation: (automation) => ipcRenderer.send("save-automation", automation),
  deleteAutomation: (id) => ipcRenderer.send("delete-automation", id),
  testAutomation: (automation) => ipcRenderer.invoke("test-automation", automation),
  getPrebuiltAutomations: () => ipcRenderer.invoke("get-prebuilt-automations"),

  // External links
  openExternal: (url) => shell.openExternal(url),

  // PostHog
  trackEvent: (eventName, properties) =>
    ipcRenderer.send("track-event", { eventName, properties }),

  // Meeting status
  onMeetingStatus: (callback) => ipcRenderer.on("meeting-status", (_event, status) => callback(status)),

  // Timer restart (for break overlay)
  restartMainTimer: () => ipcRenderer.send("end-break"),

  // Platform
  platform: process.platform,

  // Logging
  log: (msg) => console.log(msg),
});
