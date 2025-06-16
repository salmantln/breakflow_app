const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require("child_process");
const TeamsMeetingDetector = require('./meeting-detector');
// const psList = require('ps-list');
const loudness = require('loudness');

const SimpleTeamsDetector = require('./simple-detector');

// Global variables
let mainWindow;
let meetingStartNotification;
let meetingEndNotification;
let tray;
let isWorkTime = true;
let timerPaused = false;
let currentTime = 25 * 60; // Default 25 min work time
let breakTime = 5 * 60; // Default 5 min break time
let completedSessions = 0;
let timerInterval;
let settings = {};
let inMeeting = false;

// Get user settings path
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');

// Load settings
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

      // Apply settings
      if (settings.workDuration) currentTime = settings.workDuration * 60;
      if (settings.breakDuration) breakTime = settings.breakDuration * 60;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    settings = {
      workDuration: 25,
      breakDuration: 5
    };
  }
}

// Save settings
function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf8');

  // Update timers if needed
  if (newSettings.workDuration && isWorkTime) {
    currentTime = newSettings.workDuration * 60;
  }
  if (newSettings.breakDuration && !isWorkTime) {
    currentTime = newSettings.breakDuration * 60;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Allow IPC
    }
  });

  mainWindow.loadFile("index.html"); // Load UI
}


// function createMainWindow() {
//   mainWindow = new BrowserWindow({
//     width: 700,
//     height: 400,
//     resizable: false,
//     frame: process.platform === 'darwin', // Use native frame for macOS
//     titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
//     trafficLightPosition: { x: 10, y: 10 }, // Position traffic lights for macOS
//     backgroundColor: process.platform === 'darwin' ? 'transparent' : '#2f3136',
//     webPreferences: {
//       nodeIntegration: true,
//       contextIsolation: true,
//       preload: path.join(__dirname, "preload.js"),
//     },
//     icon: path.join(__dirname, "./public/icons/icon.png"),
//   });

//   mainWindow.loadFile("index.html");
//   createMiniWindow();

//   posthog.capture({
//     distinctId: "user_id",
//     event: "app_started",
//   });

//   // Window control handlers - only needed for Windows
//   if (process.platform !== 'darwin') {
//     ipcMain.on("window-minimize", () => {
//       mainWindow.hide();
//       miniWindow.show();
//     });

//     ipcMain.on("window-maximize", () => {
//       if (mainWindow.isMaximized()) {
//         mainWindow.unmaximize();
//       } else {
//         mainWindow.maximize();
//       }
//     });
//   }

//   ipcMain.on("mainWindow-maximize", () => {
//     miniWindow.hide();
//     mainWindow.show();
//   });

//   ipcMain.on("window-close", () => {
//     mainWindow.close();
//   });

//   mainWindow.webContents.setBackgroundThrottling(false);

//   // Update window close event
//   mainWindow.on("close", (event) => {
//     if (!isQuitting) {
//       event.preventDefault();
//       mainWindow.close();
//     }
//   });

//   // Handle macOS specific behaviors
//   if (process.platform === 'darwin') {
//     // Disable maximize on macOS since the app is fixed size
//     mainWindow.setMaximizable(false);

//     // Optional: Handle macOS full-screen behavior
//     mainWindow.on('enter-full-screen', () => {
//       mainWindow.setResizable(true);
//     });

//     mainWindow.on('leave-full-screen', () => {
//       mainWindow.setResizable(false);
//     });
//   }
// }


// Create the main window
function createWindow() {
  // Using your existing window configuration
  mainWindow = new BrowserWindow({
    width: 700,
    height: 400,
    resizable: false,
    frame: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  if (Notification.permission !== 'granted') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification('Test Notification', { body: 'This is a test notification' }).show();
      }
    });
  }

  
  // Handle window close event
  mainWindow.on('close', (event) => {
    if (app.quitting) {
      mainWindow = null;
    } else {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Create system tray
function createTray() {
  // tray = new Tray(path.join(__dirname, 'assets', 'icon16x16.png'));
  tray = new Tray("./public/icons/icon-16x16.png");
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Focus Timer');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

// Format time for display
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Start timer
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerPaused = false;
  timerInterval = setInterval(() => {
    if (currentTime > 0) {
      currentTime--;
      sendTimerUpdate();
    } else {
      // Timer finished
      clearInterval(timerInterval);

      if (isWorkTime) {
        // Work time finished, start break
        isWorkTime = false;
        completedSessions++;
        currentTime = breakTime;
        notifyBreakStart();
      } else {
        // Break time finished, start work
        isWorkTime = true;
        currentTime = settings.workDuration * 60 || 25 * 60;
        notifyWorkStart();
      }

      startTimer();
    }
  }, 1000);
}

// Pause timer
function pauseTimer() {
  timerPaused = true;
  clearInterval(timerInterval);
  sendTimerUpdate();
}

// Reset timer
function resetTimer() {
  clearInterval(timerInterval);
  isWorkTime = true;
  timerPaused = false;
  currentTime = settings.workDuration * 60 || 25 * 60;
  sendTimerUpdate();
  startTimer();
}

// Send timer update to renderer
function sendTimerUpdate() {
  if (mainWindow) {
    mainWindow.webContents.send('timer-update', {
      time: formatTime(currentTime),
      isWorking: isWorkTime,
      isPaused: timerPaused,
      completedSessions: completedSessions,
      inMeeting: inMeeting
    });
  }
}

// Notifications
function notifyBreakStart() {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Break Time',
      body: `Take a ${settings.breakDuration} minute break!`,
      silent: false
    });
    notification.show();
  }
}

function notifyWorkStart() {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Work Time',
      body: 'Back to work!',
      silent: false
    });
    notification.show();
  }
}

// App initialization
app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createTray();
  startTimer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

});










// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up before quit
app.on('before-quit', () => {
  if (globalShortcut) {
    globalShortcut.unregisterAll();
  }
});

// IPC handlers
ipcMain.on('start-timer', () => {
  startTimer();
});

ipcMain.on('pause-timer', () => {
  pauseTimer();
});

ipcMain.on('reset-timer', () => {
  resetTimer();
});

ipcMain.on('notify-breaktime', () => {
  notifyBreakStart();
});

ipcMain.on('start-break', () => {
  isWorkTime = false;
  currentTime = settings.breakDuration * 60 || 5 * 60;
  sendTimerUpdate();
});

ipcMain.handle('get-settings', () => {
  return settings;
});

ipcMain.on('save-settings', (event, newSettings) => {
  saveSettings(newSettings);
});

ipcMain.on('update-timer', (event, seconds) => {
  // This is for syncing timer between main process and renderer
  currentTime = seconds;
});

ipcMain.on('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('close-window', () => {
  mainWindow.hide();
});




// Respond to timer restart from renderer
ipcMain.on('timer-restart', () => {
  mainWindow.webContents.send('timer-restart');
});
// let detector;


// Initialize the Teams meeting detector
const detector = new SimpleTeamsDetector({
  checkIntervalMs: 5000, // Check every 10 seconds
  debug: true, // Enable debugging
  onMeetingStart: () => {
    console.log('⭐️ MEETING STARTED ⭐️');
    inMeeting = true;
    
    // Show simple notification
    const notification = new Notification({
      title: 'Meeting Started',
      body: 'Teams meeting detected'
    });
    notification.show();
    
    // Update renderer if needed
    sendTimerUpdate();
  },
  onMeetingEnd: () => {
    console.log('⭐️ MEETING ENDED ⭐️');
    inMeeting = false;
    
    // Show simple notification
    const notification = new Notification({
      title: 'Meeting Ended',
      body: 'Teams meeting has ended'
    });
    notification.show();
    
    // Update renderer if needed
    sendTimerUpdate();
  }
});



// detector = new TeamsMeetingDetector({
//   checkIntervalMs: 5000, // Check every 10 seconds
//   detectionMethods: ['process', 'window'], // Using the working methods
//   debug: true, // Enable debug logging
//   onMeetingStart: () => {
//     console.log('Teams meeting detected! Showing notification...');

//     inMeeting = true; // Update your global variable

//     // Show a simple notification
//     showSimpleNotification('Meeting Started', 'Teams meeting is now in progress');

//     // Update UI if needed
//     sendTimerUpdate();
//   },
//   onMeetingEnd: () => {
//     console.log('Teams meeting ended. Showing notification...');

//     inMeeting = false; // Update your global variable

//     // Show a simple notification
//     showSimpleNotification('Meeting Ended', 'Teams meeting has ended');

//     // Update UI if needed
//     sendTimerUpdate();
//   }
// });

// Start monitoring Teams meetings
detector.start();

function testNotification() {
  showSimpleNotification('Test Notification', 'This is a test notification');
}


function showSimpleNotification(title, body) {
  if (Notification.isSupported()) {
    let notification = new Notification({
      title: title,
      body: body
    });

    notification.show();
    console.log(`Showing notification: ${title} - ${body}`);
  } else {
    console.log("Notifications are not supported on this platform.");
  }
}


app.on('will-quit', () => {
  if (detector) {
    detector.stop();
  }

  // Clean up any lingering notifications
  if (meetingStartNotification) {
    meetingStartNotification.close();
  }
  if (meetingEndNotification) {
    meetingEndNotification.close();
  }
});