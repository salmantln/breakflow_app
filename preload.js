// preload.js
const { contextBridge, ipcRenderer, shell } = require("electron");

// Add this microphone check function
async function checkMicrophone() {
  try {
    console.log("Checking microphone access in renderer...");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // If we got here, the microphone is available
    stream.getTracks().forEach(track => track.stop());
    console.log("Microphone is available (not in use)");
    return false;
  } catch (error) {
    console.log("Microphone check error:", error.name);
    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      console.log("Microphone is in use - likely in a call");
      return true; // Microphone is likely in use
    } else {
      
      console.log("Microphone check inconclusive");
      return null; // Inconclusive
    }
  }
}

// Expose the existing electronAPI
contextBridge.exposeInMainWorld("electronAPI", {
  // Timer controls
  startBreak: () => ipcRenderer.send("start-break"),
  endBreak: () => ipcRenderer.send("end-break"),
  skipBreak: () => ipcRenderer.send("skip-break"),
  // updateTime: (seconds) => ipcRenderer.send('time-update', seconds),
  updateTimer: (seconds) => ipcRenderer.send("timer-update", seconds),
  onTimerRestart: (callback) => ipcRenderer.on("restart-timer", callback),

  // Timer state listeners
  onBreakSkipped: (callback) => ipcRenderer.on("break-skipped", callback),
  onBreakStateChange: (callback) =>
    ipcRenderer.on("break-state-change", callback),
  onBreakEnd: (callback) => ipcRenderer.on("break-end", callback),

  // Window controls
  lockScreen: () => ipcRenderer.send("lock-screen"),

  // Progress updates
  updateBreakProgress: (data) => {
    console.log("Sending break progress update:", data);
    ipcRenderer.send("update-break-progress", data);
  },

  // Utility methods
  getBreakProgress: () => ipcRenderer.invoke("get-break-progress"),
  playNotification: () => ipcRenderer.send("play-notification"),
  log: (msg) => console.log(msg),

  // Optional: Debug channel for development
  debug:
    process.env.NODE_ENV === "development"
      ? {
        listenerCount: (channel) => ipcRenderer.listenerCount(channel),
        removeAllListeners: (channel) =>
          ipcRenderer.removeAllListeners(channel),
      }
      : null,

  onTimerUpdate: (callback) => {
    console.log("Setting up timer update listener");
    // Remove any existing listeners to prevent duplicates
    ipcRenderer.removeAllListeners("timer-update");
    ipcRenderer.on("timer-update", (event, data) => {
      console.log("Timer update received in preload:", data);
      callback(event, data);
    });
  },

  restartMainTimer: () => ipcRenderer.send("break-end"),

  //Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.send("save-settings", settings),
  getBreakDuration: () => ipcRenderer.invoke("get-break-duration"),
  onSettingsUpdated: (callback) => ipcRenderer.on("settings-updated", callback),

  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  maximizeWindow: () => ipcRenderer.send("window-maximize"),
  showMain: () => ipcRenderer.send("mainWindow-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),

  //cursor
  notifyBreaktime: () => ipcRenderer.send("notify-breaktime"),
  onTimeSync: (callback) => ipcRenderer.on('sync-time', callback),

  //open site links
  openExternal: (url) => shell.openExternal(url),

  // Posthog
  trackEvent: (eventName, properties) =>
    ipcRenderer.send("track-event", { eventName, properties }),

  platform: process.platform,

  onMeetingStatus: (callback) => ipcRenderer.on('meeting-status', (_event, status) => callback(status))
});