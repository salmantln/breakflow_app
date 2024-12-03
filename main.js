const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Notification,
  Tray,
  Menu,
} = require("electron");
const path = require("path");
const log = require("electron-log");
// const posthog = require("posthog-js");
const { PostHog } = require("posthog-node");

const Store = require("electron-store");
const store = new Store({
  defaults: {
    settings: {
      workDuration: 20,
      breakDuration: 7, // in seconds
    },
  },
});

let settingsWindow = null;

let mainWindow;
let miniWindow;
let notificationWindow = null;
let breakOverlays = [];
const NOTIFICATION_TITLE = "Basic Notification";
const NOTIFICATION_BODY = "Notification from the Main process";
let isQuitting = false;

// posthog.init("phc_oiT6xqlzpRHuNzdqhh2YFkDnexdyeoix1Gz59UAXfsa", {
//   api_host: "https://eu.i.posthog.com",
//   person_profiles: "identified_only", // or 'always' to create profiles for anonymous users as well
// });

const posthog = new PostHog(
  "phc_oiT6xqlzpRHuNzdqhh2YFkDnexdyeoix1Gz59UAXfsa", // Replace with your PostHog API key
  {
    host: "https://eu.i.posthog.com", // Or your self-hosted URL
    // host: "https://app.posthog.com", // Or your self-hosted URL
    flushAt: 1, // Send events immediately in development
  }
);

function showNotification() {
  new Notification({
    title: NOTIFICATION_TITLE,
    body: NOTIFICATION_BODY,
  }).show();
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 940,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  settingsWindow.loadFile("settings.html");

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

// Add to your existing IPC handlers
ipcMain.handle("get-settings", () => {
  return store.get("settings", {
    workDuration: 20,
    breakDuration: 7,
    autoStartBreaks: false,
  });
});

ipcMain.on("save-settings", (event, settings) => {
  store.set("settings", settings);
  // Notify other windows of settings change
  mainWindow.webContents.send("settings-updated", settings);
  if (miniWindow) {
    miniWindow.webContents.send("settings-updated", settings);
  }
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 400,
    // minWidth: 800,
    // minHeight: 600,
    resizable: true,
    frame: false, // Remove default window frame
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "./public/icons/icon.png"),
  });

  mainWindow.loadFile("index.html");
  createMiniWindow();

  posthog.capture({
    distinctId: "user_id", // You might want to generate/store a unique user ID
    event: "app_started",
  });

  // Window control handlers
  ipcMain.on("window-minimize", () => {
    // mainWindow.minimize();
    mainWindow.hide();
    miniWindow.show();
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    mainWindow.close();
  });
  mainWindow.webContents.setBackgroundThrottling(false);
  // Update window close event
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.close();
    }
  });
}

function createBreakOverlay() {
  // Close any existing overlays
  breakOverlays.forEach((overlay) => {
    if (overlay && !overlay.isDestroyed()) {
      overlay.close();
    }
  });
  breakOverlays = []; // Clear the array

  const displays = screen.getAllDisplays();

  // Log displays for debugging
  log.info(
    `Found ${displays.length} displays:`,
    displays.map((d) => ({ id: d.id, bounds: d.bounds }))
  );

  // Create a Set of unique display IDs
  const uniqueDisplays = new Map();
  displays.forEach((display) => {
    if (!uniqueDisplays.has(display.id)) {
      uniqueDisplays.set(display.id, display);
    }
  });

  // Create overlay for unique displays only
  uniqueDisplays.forEach((display) => {
    log.info(`Creating overlay for unique display ${display.id}`);

    const overlay = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      autoHideMenuBar: true,
      resizable: false,
      // resizable: true,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
      icon: path.join(__dirname, "./public/icons/icon.png"),
    });

    overlay.loadFile("break-overlay.html");
    overlay.setAlwaysOnTop(true, "screen-saver");

    // Enable DevTools in development
    if (process.env.NODE_ENV === "development") {
      overlay.webContents.openDevTools();
    }

    breakOverlays.push(overlay);
  });

  log.info(`Created ${breakOverlays.length} overlay windows`);
}

function createMiniWindow() {
  miniWindow = new BrowserWindow({
    width: 200,
    height: 80,
    frame: false,
    resizable: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "./public/icons/icon.png"),
  });

  miniWindow.loadFile("mini.html");
  miniWindow.webContents.setBackgroundThrottling(false);
  miniWindow.on("click", () => {
    miniWindow.hide();
    mainWindow.show();
  });
}

// Add IPC handlers
ipcMain.on("start-break", () => {
  mainWindow.minimize();
  miniWindow.hide();
  createBreakOverlay();
});

function createCursorNotification() {
  notificationWindow = new BrowserWindow({
    width: 220,
    height: 60,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    resizable: false, // Add this
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  notificationWindow.loadFile("cursor-notification.html");

  // Follow cursor position
  const updatePosition = () => {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      const cursor = screen.getCursorScreenPoint();
      notificationWindow.setPosition(cursor.x + 10, cursor.y + 10);
    }
  };

  const positionInterval = setInterval(updatePosition, 16);

  // Show the window
  notificationWindow.show();

  // Auto-close after 5 seconds
  setTimeout(() => {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
      clearInterval(positionInterval);
    }
  }, 5000);
}

ipcMain.on("skip-break", () => {
  breakOverlays.forEach((overlay) => {
    if (overlay && !overlay.isDestroyed()) {
      overlay.destroy();
    }
  });
  breakOverlays = [];
});

// Sync time between windows
ipcMain.on("timer-update", (event, time) => {
  console.log("Main.js Timer: ", time);
  // if (miniWindow && !miniWindow.isDestroyed()) {
  miniWindow.webContents.send("sync-time", time);
  // }
});
// ipcMain.on("time-update", (event, time) => {
//   if (mainWindow && !mainWindow.isDestroyed()) {
//     mainWindow.webContents.send("sync-time", time);
//   }
//   if (miniWindow && !miniWindow.isDestroyed()) {
//     miniWindow.webContents.send("sync-time", time);
//   }
// });

ipcMain.on("update-break-progress", (event, { percent, timeLeft }) => {
  // Format the time if it's a number
  const formattedTime =
    typeof timeLeft === "number" ? formatTime(timeLeft) : timeLeft;

  // Send a single update with all necessary data
  const updateData = {
    percent,
    timeLeft: formattedTime,
  };

  log.info("Sending break overlay update:", updateData);

  // Update all break overlays
  breakOverlays.forEach((overlay) => {
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send("timer-update", updateData);
      log.info(`Sent update to overlay: ${overlay.id}`);
    }
  });

  // Update other windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("timer-update", updateData);
  }
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send("timer-update", updateData);
  }
});

ipcMain.on("break-end", () => {
  breakOverlays.forEach((overlay) => {
    if (overlay && !overlay.isDestroyed()) {
      overlay.destroy();
    }
  });
  mainWindow.show();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("restart-timer");
  }
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send("restart-timer");
  }
});

ipcMain.on("show-main", () => {
  miniWindow.hide();
  mainWindow.show();
});

// Handle lock screen request
ipcMain.on("lock-screen", () => {
  // This might need to be adjusted based on your OS
  if (process.platform === "darwin") {
    // MacOS
    require("child_process").exec("pmset displaysleepnow");
  } else if (process.platform === "win32") {
    // Windows
    require("child_process").exec("rundll32.exe user32.dll,LockWorkStation");
  } else {
    // Linux
    require("child_process").exec("xdg-screensaver activate");
  }
});

// Add IPC handler for getting break duration
ipcMain.handle("get-break-duration", () => {
  return store.get("settings.breakDuration");
});

// Add to main.js
ipcMain.on("notify-breaktime", () => {
  console.log("Received notify-breaktime event");
  createCursorNotification();
});

let tray;
app.whenReady().then(() => {
  createMainWindow();
  tray = new Tray("./public/icons/icon.png");
  const contextMenu = Menu.buildFromTemplate([
    { label: "Settings", click: () => createSettingsWindow() },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
    // { label: "Item1", type: "radio" },
    // { label: "Item2", type: "radio" },
    // { label: "Item3", type: "radio", checked: true },
    // { label: "Item4", type: "radio" },
  ]);

  tray.setToolTip("This is my application.");
  tray.setContextMenu(contextMenu);
});

app.on("before-quit", async () => {
  isQuitting = true;
  if (posthog) await posthog.shutdown();

  // Clean up all windows
  if (mainWindow) mainWindow.destroy();
  if (miniWindow) miniWindow.destroy();
  if (notificationWindow) notificationWindow.destroy();
  breakOverlays.forEach((overlay) => {
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

// .then(createMainWindow);
