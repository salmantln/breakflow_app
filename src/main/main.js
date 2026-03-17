const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, globalShortcut, screen, dialog, nativeTheme, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const ActivityDetector = require('../detectors/activity-detector');
const AutomationRunner = require('./automation-runner');

// electron-store with schema defaults
const store = new Store({
  defaults: {
    workDuration: 20,
    breakDuration: 5,
    autoStartBreaks: true,
    autoPauseMeetings: true,
    autoPauseFullscreen: true,
    autoPauseRecording: true,
    autoPauseVideoPlayback: false,
    autoPauseCalendarEvents: false,
    focusApps: ['Visual Studio Code', 'Code', 'Xcode', 'IntelliJ IDEA', 'WebStorm', 'Figma', 'Photoshop', 'Sublime Text', 'Cursor'],
    focusAppBehavior: 'delay', // 'delay' or 'skip'
    theme: 'dark',
    accentColor: '#5865f2',
    notificationSound: 'bell',
    breakBackground: 'blur',
    postureReminder: false,
    postureInterval: 30,
    widgetPosition: null,
    widgetVisible: false,
    // Phase 1: Cooldown + Idle/Away
    smartPauseCooldown: 2,
    awayBehavior: 'automatic',
    awayIdleThreshold: 5,
    // Phase 3: Custom messages + Enhanced sounds
    useCustomMessages: false,
    customBreakMessages: [],
    soundVolume: 80,
    playSoundOnBreakStart: true,
    playSoundOnBreakEnd: true,
    // Phase 4: Enhanced backgrounds
    breakBackgroundType: 'preset',
    customBreakImage: '',
    breakGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    // Phase 5: Automations
    automations: [],
    // Office Hours
    officeHoursEnabled: false,
    officeHoursScheduleType: 'same', // 'same' or 'different'
    officeHoursSchedule: {
      mon: { enabled: true, start: '10:00', end: '19:00' },
      tue: { enabled: true, start: '10:00', end: '19:00' },
      wed: { enabled: true, start: '10:00', end: '19:00' },
      thu: { enabled: true, start: '10:00', end: '19:00' },
      fri: { enabled: true, start: '10:00', end: '19:00' },
      sat: { enabled: false, start: '10:00', end: '19:00' },
      sun: { enabled: false, start: '10:00', end: '19:00' },
    },
    // Long Breaks
    longBreaksEnabled: false,
    longBreakEvery: 3,
    longBreakDuration: 3,
    // Break Skip Difficulty
    breakSkipDifficulty: 'casual', // 'casual', 'balanced', 'hardcore'
    // Typing/Dragging pause
    dontBreakWhileTyping: false,
    // End break early
    endBreakEarlyIfNearly: false,
    endBreakEarlyThreshold: 10,
    // Break Reminders & Nudges
    breakReminderEnabled: true,
    breakReminderMinutes: 1,
    breakReminderDuration: 10,
    countdownEnabled: true,
    countdownDuration: 5,
    overtimeNudgeEnabled: true,
    overtimeNudgeShowWhenPaused: true,
  }
});

// Global variables
let mainWindow;
let breakOverlayWindow;
let widgetWindow;
let tray;
let isWorkTime = true;
let timerPaused = false;
let currentTime = store.get('workDuration') * 60;
let breakTime = store.get('breakDuration') * 60;
let completedSessions = 0;
let timerInterval;
let pauseReason = null; // null, 'meeting', 'fullscreen', 'recording', 'video', 'calendar'
let inMeeting = false;
let meetingSource = null;
let postureInterval = null;
let detector;
let automationRunner;
let cooldownTimeout = null;
let idleCheckInterval = null;
let isIdlePaused = false;
let countdownWindow = null;
let overtimeNudgeWindow = null;
let overtimeStartTime = null;
let overtimeInterval = null;
let lastInputTime = Date.now();

// Format time for display
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Create the main window
function createWindow() {
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

  mainWindow.loadFile(path.join(__dirname, '../renderer/pages/index.html'));

  mainWindow.on('close', (event) => {
    if (app.quitting) {
      mainWindow = null;
    } else {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Create break overlay window
function createBreakOverlay() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  breakOverlayWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  breakOverlayWindow.loadFile(path.join(__dirname, '../renderer/pages/break-overlay.html'));
  breakOverlayWindow.setAlwaysOnTop(true, 'screen-saver');

  breakOverlayWindow.on('closed', () => {
    breakOverlayWindow = null;
  });
}

// Create floating widget window
function createWidgetWindow() {
  const savedPos = store.get('widgetPosition');

  widgetWindow = new BrowserWindow({
    width: 160,
    height: 48,
    x: savedPos ? savedPos.x : undefined,
    y: savedPos ? savedPos.y : undefined,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  widgetWindow.loadFile(path.join(__dirname, '../renderer/pages/mini.html'));
  widgetWindow.setAlwaysOnTop(true, 'floating');

  // Save position on move
  widgetWindow.on('moved', () => {
    const pos = widgetWindow.getBounds();
    store.set('widgetPosition', { x: pos.x, y: pos.y });
  });

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });

  if (!store.get('widgetVisible')) {
    widgetWindow.hide();
  }
}

// Create system tray with dynamic updates
function createTray() {
  tray = new Tray(path.join(__dirname, '../../assets/icons/icon-16x16.png'));
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const stateLabel = isWorkTime ? `Work: ${formatTime(currentTime)}` : `Break: ${formatTime(currentTime)}`;

  let statusLine = 'Monitoring for meetings...';
  if (pauseReason === 'meeting') {
    statusLine = `In Meeting — ${meetingSource || 'detected'} (auto-paused)`;
  } else if (pauseReason === 'fullscreen') {
    statusLine = 'Fullscreen app detected (auto-paused)';
  } else if (pauseReason === 'recording') {
    statusLine = 'Screen recording detected (auto-paused)';
  } else if (pauseReason === 'video') {
    statusLine = 'Video playback detected (auto-paused)';
  } else if (pauseReason === 'calendar') {
    statusLine = 'Calendar event in progress (auto-paused)';
  } else if (pauseReason === 'idle') {
    statusLine = 'Away — timer paused';
  } else if (inMeeting) {
    statusLine = `In Meeting — ${meetingSource || 'detected'}`;
  }

  const template = [
    { label: stateLabel, enabled: false },
    { type: 'separator' },
    {
      label: timerPaused ? 'Resume' : 'Pause',
      click: () => { timerPaused ? startTimer() : pauseTimer(); }
    },
    ...(isWorkTime
      ? [{ label: 'Skip to Break', click: () => { skipToBreak(); } }]
      : [{ label: 'Skip Break', click: () => { skipBreak(); } }]
    ),
    { type: 'separator' },
    { label: statusLine, enabled: false },
    { type: 'separator' },
    {
      label: widgetWindow && widgetWindow.isVisible() ? 'Hide Widget' : 'Show Widget',
      click: () => { toggleWidget(); }
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('show-settings');
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quitting = true; app.quit(); } }
  ];

  const contextMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Break Flow — ${stateLabel}`);

  // macOS: show time in menu bar
  if (process.platform === 'darwin') {
    tray.setTitle(formatTime(currentTime));
  }
}

// Check if currently within office hours
function isWithinOfficeHours() {
  if (!store.get('officeHoursEnabled')) return true;

  const now = new Date();
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayKey = dayNames[now.getDay()];
  const schedule = store.get('officeHoursSchedule') || {};
  const daySchedule = schedule[dayKey];

  if (!daySchedule || !daySchedule.enabled) return false;

  const [startH, startM] = daySchedule.start.split(':').map(Number);
  const [endH, endM] = daySchedule.end.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  return nowMins >= startMins && nowMins < endMins;
}

// Get break duration accounting for long breaks
function getEffectiveBreakDuration() {
  if (store.get('longBreaksEnabled')) {
    const every = store.get('longBreakEvery') || 3;
    if (completedSessions > 0 && completedSessions % every === 0) {
      return (store.get('longBreakDuration') || 3) * 60;
    }
  }
  return store.get('breakDuration') * 60;
}

// Show countdown notification before break
function showCountdownNotification(durationSeconds, callback) {
  if (countdownWindow) {
    countdownWindow.close();
    countdownWindow = null;
  }

  const { x, y } = screen.getCursorScreenPoint();
  countdownWindow = new BrowserWindow({
    width: 280,
    height: 60,
    x: x + 20,
    y: y - 70,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  countdownWindow.loadFile(path.join(__dirname, '../renderer/pages/cursor-notification.html'));
  countdownWindow.setAlwaysOnTop(true, 'screen-saver');

  countdownWindow.on('closed', () => {
    countdownWindow = null;
  });

  // Close after duration + margin and trigger callback
  setTimeout(() => {
    if (countdownWindow) {
      countdownWindow.close();
      countdownWindow = null;
    }
    if (callback) callback();
  }, (durationSeconds + 1) * 1000);
}

// Show overtime nudge
function showOvertimeNudge() {
  if (overtimeNudgeWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  overtimeNudgeWindow = new BrowserWindow({
    width: 280,
    height: 70,
    x: width - 300,
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  overtimeNudgeWindow.loadFile(path.join(__dirname, '../renderer/pages/overtime-nudge.html'));
  overtimeNudgeWindow.setAlwaysOnTop(true, 'floating');

  overtimeNudgeWindow.on('closed', () => {
    overtimeNudgeWindow = null;
  });
}

function closeOvertimeNudge() {
  if (overtimeNudgeWindow) {
    overtimeNudgeWindow.close();
    overtimeNudgeWindow = null;
  }
  if (overtimeInterval) {
    clearInterval(overtimeInterval);
    overtimeInterval = null;
  }
  overtimeStartTime = null;
}

// Timer functions
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerPaused = false;
  pauseReason = null;
  closeOvertimeNudge();

  timerInterval = setInterval(() => {
    if (currentTime > 0) {
      currentTime--;
      sendTimerUpdate();
      updateTrayMenu();

      // Show break reminder notification N minutes before break
      if (isWorkTime && store.get('breakReminderEnabled')) {
        const reminderSeconds = (store.get('breakReminderMinutes') || 1) * 60;
        if (currentTime === reminderSeconds) {
          showSimpleNotification('Break Coming Up', `Break starts in ${store.get('breakReminderMinutes')} minute(s)`);
        }
      }
    } else {
      clearInterval(timerInterval);

      if (isWorkTime) {
        // Check office hours
        if (!isWithinOfficeHours()) {
          currentTime = 5 * 60; // re-check in 5 min
          sendTimerUpdate();
          startTimer();
          return;
        }

        // Check if focus app is active — delay break
        const status = detector ? detector.getStatus() : {};
        if (status.isFocusApp && store.get('focusAppBehavior') === 'delay') {
          currentTime = 5 * 60;
          sendTimerUpdate();
          startTimer();
          showSimpleNotification('Break Delayed', `${status.focusedApp} is active — break delayed 5 min`);
          return;
        }

        // Check typing/dragging — delay break
        if (store.get('dontBreakWhileTyping')) {
          const idleTime = powerMonitor.getSystemIdleTime();
          if (idleTime < 3) {
            // User is actively typing, delay 30s
            currentTime = 30;
            sendTimerUpdate();
            startTimer();
            return;
          }
        }

        // Show countdown before break
        if (store.get('countdownEnabled')) {
          const countdownSecs = store.get('countdownDuration') || 5;
          showCountdownNotification(countdownSecs, () => {
            triggerBreak();
          });
          return;
        }

        triggerBreak();
      } else {
        isWorkTime = true;
        currentTime = store.get('workDuration') * 60;
        notifyWorkStart();
        if (breakOverlayWindow) {
          breakOverlayWindow.close();
          breakOverlayWindow = null;
        }
        startTimer();
      }
    }
  }, 1000);
}

function triggerBreak() {
  isWorkTime = false;
  completedSessions++;
  currentTime = getEffectiveBreakDuration();
  breakTime = currentTime;
  sendTimerUpdate();
  notifyBreakStart();
  createBreakOverlay();
  startTimer();

  // Start overtime tracking for nudge
  if (store.get('overtimeNudgeEnabled')) {
    overtimeStartTime = Date.now();
  }
}

function pauseTimer(reason) {
  timerPaused = true;
  if (reason) pauseReason = reason;
  clearInterval(timerInterval);
  sendTimerUpdate();
  updateTrayMenu();
}

function resetTimer() {
  clearInterval(timerInterval);
  isWorkTime = true;
  timerPaused = false;
  pauseReason = null;
  currentTime = store.get('workDuration') * 60;
  sendTimerUpdate();
  startTimer();
}

function skipToBreak() {
  clearInterval(timerInterval);
  isWorkTime = false;
  completedSessions++;
  currentTime = breakTime;
  sendTimerUpdate();
  notifyBreakStart();
  createBreakOverlay();
  startTimer();
}

function skipBreak() {
  clearInterval(timerInterval);
  closeOvertimeNudge();
  if (breakOverlayWindow) {
    breakOverlayWindow.close();
    breakOverlayWindow = null;
  }
  isWorkTime = true;
  currentTime = store.get('workDuration') * 60;
  sendTimerUpdate();
  startTimer();
}

function delayBreak(minutes) {
  if (breakOverlayWindow) {
    breakOverlayWindow.close();
    breakOverlayWindow = null;
  }
  clearInterval(timerInterval);
  isWorkTime = true;
  currentTime = minutes * 60;
  sendTimerUpdate();
  startTimer();
}

// Send timer update to all windows
function sendTimerUpdate() {
  const isLongBreak = store.get('longBreaksEnabled') && completedSessions > 0 && completedSessions % (store.get('longBreakEvery') || 3) === 0;
  const data = {
    time: formatTime(currentTime),
    rawSeconds: currentTime,
    isWorking: isWorkTime,
    isPaused: timerPaused,
    completedSessions: completedSessions,
    inMeeting: inMeeting,
    meetingSource: meetingSource,
    autoPaused: !!pauseReason,
    pauseReason: pauseReason,
    breakSkipDifficulty: store.get('breakSkipDifficulty'),
    endBreakEarlyIfNearly: store.get('endBreakEarlyIfNearly'),
    endBreakEarlyThreshold: store.get('endBreakEarlyThreshold'),
    isLongBreak: isLongBreak,
    officeHoursActive: isWithinOfficeHours(),
  };

  if (mainWindow) {
    mainWindow.webContents.send('timer-update', data);
  }
  if (widgetWindow) {
    widgetWindow.webContents.send('timer-update', data);
  }
}

// Toggle widget visibility
function toggleWidget() {
  if (!widgetWindow) {
    createWidgetWindow();
    widgetWindow.show();
    store.set('widgetVisible', true);
  } else if (widgetWindow.isVisible()) {
    widgetWindow.hide();
    store.set('widgetVisible', false);
  } else {
    widgetWindow.show();
    store.set('widgetVisible', true);
  }
  updateTrayMenu();
}

// Notifications
function notifyBreakStart() {
  showSimpleNotification('Break Time', `Take a ${store.get('breakDuration')} minute break!`);
  // Run break-start automations
  if (automationRunner) {
    automationRunner.runAutomations('break-start', store.get('automations'));
  }
}

function notifyWorkStart() {
  showSimpleNotification('Work Time', 'Back to work!');
  // Run break-end automations
  if (automationRunner) {
    automationRunner.runAutomations('break-end', store.get('automations'));
  }
}

function showSimpleNotification(title, body) {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.show();
  }
}

// Posture reminder
function startPostureReminder() {
  stopPostureReminder();
  if (store.get('postureReminder')) {
    const intervalMs = store.get('postureInterval') * 60 * 1000;
    postureInterval = setInterval(() => {
      showSimpleNotification('Posture Check', 'Sit up straight and relax your shoulders');
    }, intervalMs);
  }
}

function stopPostureReminder() {
  if (postureInterval) {
    clearInterval(postureInterval);
    postureInterval = null;
  }
}

// Register global keyboard shortcuts
function registerShortcuts() {
  globalShortcut.register('CmdOrCtrl+Shift+P', () => {
    if (timerPaused) {
      startTimer();
    } else {
      pauseTimer();
    }
  });

  globalShortcut.register('CmdOrCtrl+Shift+B', () => {
    skipToBreak();
  });

  globalShortcut.register('CmdOrCtrl+Shift+S', () => {
    if (!isWorkTime) {
      skipBreak();
    }
  });
}

// Initialize activity detector
function initDetector() {
  detector = new ActivityDetector({
    checkIntervalMs: 5000,
    debug: true,
    focusApps: store.get('focusApps'),
  });

  detector.on('pause-activity-start', ({ reason, source }) => {
    console.log(`Activity detected: ${reason} ${source || ''}`);
    inMeeting = reason === 'meeting';
    meetingSource = source || null;

    // Clear any pending cooldown since activity is starting again
    if (cooldownTimeout) {
      clearTimeout(cooldownTimeout);
      cooldownTimeout = null;
    }

    const settingMap = {
      meeting: 'autoPauseMeetings',
      fullscreen: 'autoPauseFullscreen',
      recording: 'autoPauseRecording',
      video: 'autoPauseVideoPlayback',
      calendar: 'autoPauseCalendarEvents',
    };

    if (store.get(settingMap[reason]) && !pauseReason) {
      pauseTimer(reason);
      const reasonLabels = {
        meeting: `${source || 'Meeting'} detected`,
        fullscreen: 'Fullscreen app detected',
        recording: 'Screen recording detected',
        video: 'Video playback detected',
        calendar: 'Calendar event in progress',
      };
      showSimpleNotification('Timer Auto-Paused', reasonLabels[reason] || 'Activity detected');
    }

    sendTimerUpdate();
  });

  detector.on('pause-activity-end', ({ reason }) => {
    console.log(`Activity ended: ${reason}`);
    if (reason === 'meeting') {
      inMeeting = false;
      meetingSource = null;
    }

    if (pauseReason === reason) {
      const cooldownMinutes = store.get('smartPauseCooldown') || 0;
      if (cooldownMinutes > 0) {
        // Cooldown: wait before resuming
        console.log(`Cooldown: waiting ${cooldownMinutes} min before resuming`);
        cooldownTimeout = setTimeout(() => {
          cooldownTimeout = null;
          startTimer();
          showSimpleNotification('Timer Resumed', `${reason} ended — timer resumed after cooldown`);
        }, cooldownMinutes * 60 * 1000);
      } else {
        startTimer();
        showSimpleNotification('Timer Resumed', `${reason} ended — timer resumed`);
      }
    }

    sendTimerUpdate();
  });

  detector.on('focus-app-active', ({ app: appName }) => {
    console.log(`Focus app active: ${appName}`);
  });

  detector.start();
}

// Apply theme
function applyTheme() {
  const theme = store.get('theme');
  if (theme === 'system') {
    // Follow system
  } else if (theme === 'light') {
    nativeTheme.themeSource = 'light';
  } else {
    nativeTheme.themeSource = 'dark';
  }
}

// Idle/Away detection
function startIdleDetection() {
  stopIdleDetection();
  const behavior = store.get('awayBehavior');
  if (behavior === 'disabled') return;

  idleCheckInterval = setInterval(() => {
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const thresholdSeconds = (store.get('awayIdleThreshold') || 5) * 60;
    const awayBehavior = store.get('awayBehavior');

    if (idleSeconds >= thresholdSeconds && !isIdlePaused) {
      isIdlePaused = true;
      if (awayBehavior === 'automatic' || awayBehavior === 'pause') {
        if (!timerPaused) {
          pauseTimer('idle');
          showSimpleNotification('Timer Paused', 'You appear to be away');
        }
      }
      // 'continue' mode: do nothing, timer keeps running
    } else if (idleSeconds < thresholdSeconds && isIdlePaused) {
      isIdlePaused = false;
      if (pauseReason === 'idle') {
        startTimer();
        showSimpleNotification('Welcome Back', 'Timer resumed');
      }
    }
  }, 30000);
}

function stopIdleDetection() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
}

// App initialization
app.whenReady().then(() => {
  applyTheme();
  createWindow();
  createTray();
  createWidgetWindow();
  startTimer();
  initDetector();
  registerShortcuts();
  startPostureReminder();
  startIdleDetection();
  automationRunner = new AutomationRunner({ debug: true });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
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
  app.quitting = true;
  globalShortcut.unregisterAll();
});

app.on('will-quit', () => {
  if (detector) detector.stop();
  stopPostureReminder();
  stopIdleDetection();
  if (cooldownTimeout) clearTimeout(cooldownTimeout);
});

// ========================
// IPC Handlers
// ========================

ipcMain.on('start-timer', () => startTimer());
ipcMain.on('pause-timer', () => pauseTimer());
ipcMain.on('reset-timer', () => resetTimer());

ipcMain.on('start-break', () => {
  isWorkTime = false;
  currentTime = store.get('breakDuration') * 60;
  sendTimerUpdate();
  createBreakOverlay();
  startTimer();
});

ipcMain.on('skip-break', () => skipBreak());

ipcMain.on('end-break', () => {
  closeOvertimeNudge();
  if (breakOverlayWindow) {
    breakOverlayWindow.close();
    breakOverlayWindow = null;
  }
  isWorkTime = true;
  currentTime = store.get('workDuration') * 60;
  sendTimerUpdate();
  startTimer();
});

ipcMain.on('delay-break', (event, minutes) => {
  delayBreak(minutes || 5);
});

ipcMain.on('notify-breaktime', () => notifyBreakStart());

ipcMain.handle('get-settings', () => store.store);

ipcMain.on('save-settings', (event, newSettings) => {
  for (const [key, value] of Object.entries(newSettings)) {
    store.set(key, value);
  }

  // Update active timers if durations changed
  if (newSettings.workDuration && isWorkTime) {
    currentTime = newSettings.workDuration * 60;
    breakTime = store.get('breakDuration') * 60;
  }
  if (newSettings.breakDuration) {
    breakTime = newSettings.breakDuration * 60;
    if (!isWorkTime) {
      currentTime = breakTime;
    }
  }

  // Update focus apps if changed
  if (newSettings.focusApps && detector) {
    detector.setFocusApps(newSettings.focusApps);
  }

  // Update posture reminder
  if ('postureReminder' in newSettings || 'postureInterval' in newSettings) {
    startPostureReminder();
  }

  // Apply theme
  if (newSettings.theme) {
    applyTheme();
  }

  // Update idle detection
  if ('awayBehavior' in newSettings || 'awayIdleThreshold' in newSettings) {
    startIdleDetection();
  }

  // Broadcast settings update
  if (mainWindow) mainWindow.webContents.send('settings-updated', store.store);
  if (breakOverlayWindow) breakOverlayWindow.webContents.send('settings-updated', store.store);

  sendTimerUpdate();
});

ipcMain.on('update-timer', (event, seconds) => {
  currentTime = seconds;
});

ipcMain.on('toggle-widget', () => toggleWidget());

ipcMain.handle('get-break-duration', () => store.get('breakDuration'));

// Window controls
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('minimize-window', () => mainWindow && mainWindow.minimize());

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => mainWindow && mainWindow.hide());
ipcMain.on('close-window', () => mainWindow && mainWindow.hide());

ipcMain.on('mainWindow-maximize', () => {
  if (mainWindow) mainWindow.show();
  if (widgetWindow) widgetWindow.hide();
});

ipcMain.on('timer-restart', () => {
  if (mainWindow) mainWindow.webContents.send('timer-restart');
});

ipcMain.on('lock-screen', () => {
  const { exec } = require('child_process');
  if (process.platform === 'darwin') {
    exec('pmset displaysleepnow');
  } else if (process.platform === 'win32') {
    exec('rundll32.exe user32.dll,LockWorkStation');
  }
});

// Break progress
ipcMain.on('update-break-progress', (event, data) => {
  // Forward to tray or other listeners if needed
});

ipcMain.handle('get-break-progress', () => {
  return { percent: 0, timeLeft: formatTime(currentTime) };
});

// Custom sound upload
ipcMain.handle('upload-sound', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const srcPath = result.filePaths[0];
    const soundsDir = path.join(app.getPath('userData'), 'sounds');
    if (!fs.existsSync(soundsDir)) {
      fs.mkdirSync(soundsDir, { recursive: true });
    }
    const destPath = path.join(soundsDir, path.basename(srcPath));
    fs.copyFileSync(srcPath, destPath);
    return { name: path.basename(srcPath, path.extname(srcPath)), path: destPath };
  }
  return null;
});

// PostHog tracking
ipcMain.on('track-event', (event, { eventName, properties }) => {
  // PostHog tracking handled in renderer via posthog-js
});

// Upload custom break background image
ipcMain.handle('upload-break-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const srcPath = result.filePaths[0];
    const imagesDir = path.join(app.getPath('userData'), 'break-backgrounds');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    const destPath = path.join(imagesDir, path.basename(srcPath));
    fs.copyFileSync(srcPath, destPath);
    return destPath;
  }
  return null;
});

// Automation IPC handlers
ipcMain.on('save-automation', (event, automation) => {
  const automations = store.get('automations') || [];
  const idx = automations.findIndex(a => a.id === automation.id);
  if (idx >= 0) {
    automations[idx] = automation;
  } else {
    automations.push(automation);
  }
  store.set('automations', automations);
  if (mainWindow) mainWindow.webContents.send('settings-updated', store.store);
});

ipcMain.on('delete-automation', (event, automationId) => {
  const automations = (store.get('automations') || []).filter(a => a.id !== automationId);
  store.set('automations', automations);
  if (mainWindow) mainWindow.webContents.send('settings-updated', store.store);
});

ipcMain.handle('test-automation', async (event, automation) => {
  if (!automationRunner) automationRunner = new AutomationRunner({ debug: true });
  try {
    await automationRunner.execute(automation);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-prebuilt-automations', () => {
  return AutomationRunner.getPrebuiltAutomations();
});

// Overtime nudge dismiss
ipcMain.on('dismiss-overtime-nudge', () => {
  closeOvertimeNudge();
});

// Get overtime info
ipcMain.handle('get-overtime-info', () => {
  if (!overtimeStartTime) return null;
  const elapsedMs = Date.now() - overtimeStartTime;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  return { minutes: elapsedMin };
});
