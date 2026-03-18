document.addEventListener("DOMContentLoaded", async () => {
  // Get all navigation items and content sections
  const navItems = document.querySelectorAll(".nav-item");
  const contentSections = document.querySelectorAll(".content-container");

  const isMac = window.electronAPI.platform === 'darwin';
  if (isMac) {
    const titlebar = document.querySelector('.titlebar');
    if (titlebar) titlebar.style.display = 'none';
    document.body.classList.add('darwin');

    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      appContainer.style.paddingTop = '28px';
      appContainer.style.webkitAppRegion = 'drag';
    }

    document.querySelectorAll('.nav-item, button, input, select, .controls, .settings-section').forEach(el => {
      el.style.webkitAppRegion = 'no-drag';
    });

    document.querySelectorAll('.window-control-button').forEach(el => {
      el.style.display = 'none';
    });
  }

  // Window controls
  document.getElementById("minimize-button")?.addEventListener("click", () => {
    window.electronAPI.minimizeWindow();
  });
  document.getElementById("maximize-button")?.addEventListener("click", () => {
    window.electronAPI.maximizeWindow();
  });
  document.getElementById("close-button")?.addEventListener("click", () => {
    window.electronAPI.closeWindow();
  });

  function switchContent(viewId) {
    contentSections.forEach((section) => {
      section.style.display = "none";
    });
    const selectedContent = document.getElementById(`${viewId}-view`);
    if (selectedContent) {
      selectedContent.style.display = "block";
    }
  }

  // Navigation handlers
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
      switchContent(item.getAttribute("data-view"));
    });
  });

  // Listen for show-settings from main process (tray menu)
  window.electronAPI.onShowSettings(() => {
    navItems.forEach(nav => nav.classList.remove("active"));
    const settingsNav = document.querySelector('[data-view="settings"]');
    if (settingsNav) settingsNav.classList.add("active");
    switchContent("settings");
  });

  // Preload break sounds in main window for instant playback
  const breakStartSound = new Audio("../../../assets/sounds/break-start.mp3");
  const breakEndSound = new Audio("../../../assets/sounds/break-end.mp3");
  breakStartSound.preload = 'auto';
  breakEndSound.preload = 'auto';

  window.electronAPI.onPlayBreakSound(async (type) => {
    const settings = await window.electronAPI.getSettings();
    const volume = (settings.soundVolume != null ? settings.soundVolume : 80) / 100;
    const sound = type === 'start' ? breakStartSound : breakEndSound;
    const settingKey = type === 'start' ? 'playSoundOnBreakStart' : 'playSoundOnBreakEnd';
    if (settings[settingKey] !== false) {
      sound.volume = volume;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  });

  // Timer logic — driven by main process
  let time = 20 * 60;
  let timerInterval;
  let isRunning = false;
  let defaultMinutes = 20;

  function updateDisplay(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const newTime = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const display = document.getElementById("timer-display");

    if (!display.children.length) {
      display.innerHTML = newTime
        .split("")
        .map((char) => `<span class="timer-char">${char}</span>`)
        .join("");
    }

    const chars = display.children;
    newTime.split("").forEach((char, i) => {
      if (chars[i].textContent !== char) {
        chars[i].style.opacity = "0";
        chars[i].style.transform = "scale(0.88)";
        setTimeout(() => {
          chars[i].textContent = char;
          chars[i].style.opacity = "1";
          chars[i].style.transform = "scale(1)";
        }, 200);
      }
    });
  }

  // Listen for timer updates from main process
  window.electronAPI.onTimerUpdate((event, data) => {
    // Update timer display
    if (data.rawSeconds !== undefined) {
      time = data.rawSeconds;
      updateDisplay(time);
    }

    // Update status display
    const statusEl = document.getElementById("status");
    if (statusEl) {
      if (data.autoPaused && data.pauseReason) {
        const reasons = {
          meeting: `Paused — ${data.meetingSource || 'Meeting'} detected`,
          fullscreen: 'Paused — Fullscreen app detected',
          recording: 'Paused — Screen recording detected',
          video: 'Paused — Video playback detected',
          calendar: 'Paused — Calendar event in progress',
          idle: 'Paused — You appear to be away',
        };
        statusEl.textContent = reasons[data.pauseReason] || 'Auto-paused';
        statusEl.style.color = '#faa61a';
      } else if (data.inMeeting) {
        statusEl.textContent = `In meeting — ${data.meetingSource || 'detected'}`;
        statusEl.style.color = '#ed4245';
      } else if (data.isPaused) {
        statusEl.textContent = 'Paused';
        statusEl.style.color = '#747f8d';
      } else if (data.isWorking) {
        statusEl.textContent = 'Working';
        statusEl.style.color = '#43b581';
      } else {
        statusEl.textContent = 'On break';
        statusEl.style.color = '#faa61a';
      }
    }

    // Update session count
    const sessionEl = document.getElementById("session-count");
    if (sessionEl) {
      sessionEl.textContent = `Sessions: ${data.completedSessions}`;
    }
  });

  // Button handlers using main process timer
  function startTimer() {
    window.electronAPI.startTimer();
  }

  function pauseTimer() {
    window.electronAPI.pauseTimer();
  }

  function resetTimer() {
    window.electronAPI.resetTimer();
  }

  // Make timer functions globally available (for onclick in HTML)
  window.startTimer = startTimer;
  window.pauseTimer = pauseTimer;
  window.resetTimer = resetTimer;

  // Show timer view by default
  switchContent("timer");

  // Timer restart handler
  window.electronAPI.onTimerRestart(() => {
    // Main process handles the restart, renderer just updates display
  });

  // Load settings into UI
  const settings = await window.electronAPI.getSettings();

  const workDurationInput = document.getElementById("minutesInput");
  if (workDurationInput) {
    workDurationInput.value = settings.workDuration || 20;
    workDurationInput.addEventListener("change", (e) => {
      const val = parseInt(e.target.value) || 20;
      window.electronAPI.saveSettings({ workDuration: val });
    });
  }

  const breakDurationInput = document.getElementById("breakDuration");
  if (breakDurationInput) {
    breakDurationInput.value = settings.breakDuration || 5;
    breakDurationInput.addEventListener("change", (e) => {
      const val = parseInt(e.target.value) || 10;
      window.electronAPI.saveSettings({ breakDuration: val });
    });
  }

  // Smart Pause view toggles
  const spToggles = {
    'sp-autoPauseMeetings': { key: 'autoPauseMeetings', default: true },
    'sp-autoPauseFullscreen': { key: 'autoPauseFullscreen', default: true },
    'sp-autoPauseRecording': { key: 'autoPauseRecording', default: true },
    'sp-autoPauseVideoPlayback': { key: 'autoPauseVideoPlayback', default: false },
    'sp-autoPauseCalendarEvents': { key: 'autoPauseCalendarEvents', default: false },
    'sp-meetingNotification': { key: 'meetingNotification', default: true },
  };
  Object.entries(spToggles).forEach(([id, { key, default: def }]) => {
    const el = document.getElementById(id);
    if (el) {
      el.checked = def ? settings[key] !== false : (settings[key] || false);
      el.addEventListener("change", (e) => {
        window.electronAPI.saveSettings({ [key]: e.target.checked });
      });
    }
  });

  // Smart Pause cooldown dropdown
  const spCooldown = document.getElementById("sp-smartPauseCooldown");
  if (spCooldown) {
    spCooldown.value = String(settings.smartPauseCooldown != null ? settings.smartPauseCooldown : 2);
    spCooldown.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ smartPauseCooldown: parseInt(e.target.value) || 0 });
    });
  }

  // Smart Pause away behavior
  const spAwayBehavior = document.getElementById("sp-awayBehavior");
  const spAwayDesc = document.getElementById("sp-awayDesc");
  const awayDescriptions = {
    automatic: 'Automatically pause when idle and resume when you return',
    pause: 'Pause the timer when idle, but don\'t auto-resume',
    continue: 'Keep the timer running even when away',
    disabled: 'Away detection is disabled',
  };
  if (spAwayBehavior) {
    spAwayBehavior.value = settings.awayBehavior || 'automatic';
    if (spAwayDesc) spAwayDesc.textContent = awayDescriptions[spAwayBehavior.value] || '';
    spAwayBehavior.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ awayBehavior: e.target.value });
      if (spAwayDesc) spAwayDesc.textContent = awayDescriptions[e.target.value] || '';
    });
  }

  // Smart Pause idle threshold
  const spIdleThreshold = document.getElementById("sp-awayIdleThreshold");
  if (spIdleThreshold) {
    spIdleThreshold.value = settings.awayIdleThreshold || 5;
    spIdleThreshold.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ awayIdleThreshold: parseInt(e.target.value) || 10 });
    });
  }

  // Smart Pause Options buttons
  document.querySelectorAll('.smart-pause-options-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel;
      const panel = document.getElementById(panelId);
      if (panel) {
        const isOpen = panel.classList.contains('open');
        // Close all panels first
        document.querySelectorAll('.smart-pause-options-panel').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.smart-pause-options-btn').forEach(b => b.classList.remove('expanded'));
        if (!isOpen) {
          panel.classList.add('open');
          btn.classList.add('expanded');
        }
      }
    });
  });

  // Smart Pause — Focus apps list
  const spFocusAppsList = document.getElementById("sp-focusAppsList");
  const spAddFocusAppBtn = document.getElementById("sp-addFocusApp");
  const spFocusAppInput = document.getElementById("sp-focusAppInput");
  const spFocusAppBehavior = document.getElementById("sp-focusAppBehavior");

  function renderSpFocusApps(apps) {
    if (!spFocusAppsList) return;
    spFocusAppsList.innerHTML = '';
    apps.forEach((app, i) => {
      const item = document.createElement('div');
      item.className = 'focus-app-item';
      item.innerHTML = `<span>${app}</span><button class="remove-app" data-index="${i}">x</button>`;
      spFocusAppsList.appendChild(item);
    });
    spFocusAppsList.querySelectorAll('.remove-app').forEach(btn => {
      btn.addEventListener('click', () => {
        const updated = [...(settings.focusApps || [])];
        updated.splice(parseInt(btn.dataset.index), 1);
        settings.focusApps = updated;
        window.electronAPI.saveSettings({ focusApps: updated });
        renderSpFocusApps(updated);
      });
    });
  }

  if (spFocusAppsList) renderSpFocusApps(settings.focusApps || []);

  if (spFocusAppBehavior) {
    spFocusAppBehavior.value = settings.focusAppBehavior || 'delay';
    spFocusAppBehavior.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ focusAppBehavior: e.target.value });
    });
  }

  if (spAddFocusAppBtn && spFocusAppInput) {
    spAddFocusAppBtn.addEventListener("click", () => {
      const appName = spFocusAppInput.value.trim();
      if (appName) {
        const apps = [...(settings.focusApps || []), appName];
        settings.focusApps = apps;
        window.electronAPI.saveSettings({ focusApps: apps });
        renderSpFocusApps(apps);
        spFocusAppInput.value = '';
      }
    });
  }

  // Smart Pause — Meeting excluded apps list
  const spExcludedAppsList = document.getElementById("sp-excludedAppsList");
  const spAddExcludedAppBtn = document.getElementById("sp-addExcludedApp");
  const spExcludedAppInput = document.getElementById("sp-excludedAppInput");

  function renderExcludedApps(apps) {
    if (!spExcludedAppsList) return;
    spExcludedAppsList.innerHTML = '';
    apps.forEach((app, i) => {
      const item = document.createElement('div');
      item.className = 'focus-app-item';
      item.innerHTML = `<span>${app}</span><button class="remove-app" data-index="${i}">x</button>`;
      spExcludedAppsList.appendChild(item);
    });
    spExcludedAppsList.querySelectorAll('.remove-app').forEach(btn => {
      btn.addEventListener('click', () => {
        const updated = [...(settings.meetingExcludedApps || [])];
        updated.splice(parseInt(btn.dataset.index), 1);
        settings.meetingExcludedApps = updated;
        window.electronAPI.saveSettings({ meetingExcludedApps: updated });
        renderExcludedApps(updated);
      });
    });
  }

  if (spExcludedAppsList) renderExcludedApps(settings.meetingExcludedApps || []);

  if (spAddExcludedAppBtn && spExcludedAppInput) {
    spAddExcludedAppBtn.addEventListener("click", () => {
      const appName = spExcludedAppInput.value.trim();
      if (appName) {
        const apps = [...(settings.meetingExcludedApps || []), appName];
        settings.meetingExcludedApps = apps;
        window.electronAPI.saveSettings({ meetingExcludedApps: apps });
        renderExcludedApps(apps);
        spExcludedAppInput.value = '';
      }
    });
  }

  // Posture reminder
  const postureReminder = document.getElementById("postureReminder");
  if (postureReminder) {
    postureReminder.checked = settings.postureReminder || false;
    postureReminder.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ postureReminder: e.target.checked });
    });
  }

  const postureIntervalInput = document.getElementById("postureInterval");
  if (postureIntervalInput) {
    postureIntervalInput.value = settings.postureInterval || 30;
    postureIntervalInput.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ postureInterval: parseInt(e.target.value) || 30 });
    });
  }

  // Long breaks
  const longBreaksEnabled = document.getElementById("longBreaksEnabled");
  const longBreaksConfig = document.getElementById("longBreaksConfig");
  if (longBreaksEnabled) {
    longBreaksEnabled.checked = settings.longBreaksEnabled || false;
    if (longBreaksConfig) longBreaksConfig.style.display = longBreaksEnabled.checked ? 'block' : 'none';
    longBreaksEnabled.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ longBreaksEnabled: e.target.checked });
      if (longBreaksConfig) longBreaksConfig.style.display = e.target.checked ? 'block' : 'none';
    });
  }
  const longBreakEvery = document.getElementById("longBreakEvery");
  if (longBreakEvery) {
    longBreakEvery.value = settings.longBreakEvery || 3;
    longBreakEvery.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ longBreakEvery: parseInt(e.target.value) || 3 });
    });
  }
  const longBreakDuration = document.getElementById("longBreakDuration");
  if (longBreakDuration) {
    longBreakDuration.value = settings.longBreakDuration || 3;
    longBreakDuration.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ longBreakDuration: parseInt(e.target.value) || 3 });
    });
  }

  // Office hours — day circle design
  const officeHoursEnabled = document.getElementById("officeHoursEnabled");
  const officeHoursConfig = document.getElementById("officeHoursConfig");
  if (officeHoursEnabled) {
    officeHoursEnabled.checked = settings.officeHoursEnabled || false;
    if (officeHoursConfig) officeHoursConfig.style.display = officeHoursEnabled.checked ? 'block' : 'none';
    officeHoursEnabled.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ officeHoursEnabled: e.target.checked });
      if (officeHoursConfig) officeHoursConfig.style.display = e.target.checked ? 'block' : 'none';
    });
  }

  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayLetters = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };

  function renderDayCircles() {
    const container = document.getElementById("dayCircles");
    if (!container) return;
    container.innerHTML = '';
    const schedule = settings.officeHoursSchedule || {};

    dayOrder.forEach((day) => {
      const dayData = schedule[day] || { enabled: false, start: '10:00', end: '19:00' };
      const circle = document.createElement('button');
      circle.className = 'day-circle' + (dayData.enabled ? ' active' : '');
      circle.textContent = dayLetters[day];
      circle.title = day.charAt(0).toUpperCase() + day.slice(1);
      circle.addEventListener('click', () => {
        const s = settings.officeHoursSchedule || {};
        if (!s[day]) s[day] = { enabled: false, start: '10:00', end: '19:00' };
        s[day].enabled = !s[day].enabled;
        settings.officeHoursSchedule = s;
        window.electronAPI.saveSettings({ officeHoursSchedule: s });
        renderDayCircles();
      });
      container.appendChild(circle);
    });
  }

  renderDayCircles();

  // Unified time pickers for office hours
  const officeHoursStart = document.getElementById("officeHoursStart");
  const officeHoursEnd = document.getElementById("officeHoursEnd");
  const schedule = settings.officeHoursSchedule || {};
  // Get time from first enabled day or default
  const firstEnabled = dayOrder.find(d => schedule[d]?.enabled) || 'mon';
  if (officeHoursStart) officeHoursStart.value = (schedule[firstEnabled] || {}).start || '10:00';
  if (officeHoursEnd) officeHoursEnd.value = (schedule[firstEnabled] || {}).end || '19:00';

  function updateAllDayTimes() {
    const s = settings.officeHoursSchedule || {};
    const startVal = officeHoursStart ? officeHoursStart.value : '10:00';
    const endVal = officeHoursEnd ? officeHoursEnd.value : '19:00';
    dayOrder.forEach(d => {
      if (s[d]) {
        s[d].start = startVal;
        s[d].end = endVal;
      }
    });
    settings.officeHoursSchedule = s;
    window.electronAPI.saveSettings({ officeHoursSchedule: s });
  }

  if (officeHoursStart) officeHoursStart.addEventListener("change", updateAllDayTimes);
  if (officeHoursEnd) officeHoursEnd.addEventListener("change", updateAllDayTimes);

  // Break skip difficulty
  document.querySelectorAll('.skip-difficulty-btn').forEach(btn => {
    if (btn.dataset.difficulty === (settings.breakSkipDifficulty || 'casual')) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      document.querySelectorAll('.skip-difficulty-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.electronAPI.saveSettings({ breakSkipDifficulty: btn.dataset.difficulty });
    });
  });

  // Don't break while typing
  const dontBreakWhileTyping = document.getElementById("dontBreakWhileTyping");
  if (dontBreakWhileTyping) {
    dontBreakWhileTyping.checked = settings.dontBreakWhileTyping || false;
    dontBreakWhileTyping.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ dontBreakWhileTyping: e.target.checked });
    });
  }

  // End break early
  const endBreakEarlyIfNearly = document.getElementById("endBreakEarlyIfNearly");
  const earlyEndConfig = document.getElementById("earlyEndConfig");
  if (endBreakEarlyIfNearly) {
    endBreakEarlyIfNearly.checked = settings.endBreakEarlyIfNearly || false;
    if (earlyEndConfig) earlyEndConfig.style.display = endBreakEarlyIfNearly.checked ? 'block' : 'none';
    endBreakEarlyIfNearly.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ endBreakEarlyIfNearly: e.target.checked });
      if (earlyEndConfig) earlyEndConfig.style.display = e.target.checked ? 'block' : 'none';
    });
  }
  const endBreakEarlyThreshold = document.getElementById("endBreakEarlyThreshold");
  if (endBreakEarlyThreshold) {
    endBreakEarlyThreshold.value = settings.endBreakEarlyThreshold || 10;
    endBreakEarlyThreshold.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ endBreakEarlyThreshold: parseInt(e.target.value) || 10 });
    });
  }

  // Break reminders & nudges
  const breakReminderEnabled = document.getElementById("breakReminderEnabled");
  if (breakReminderEnabled) {
    breakReminderEnabled.checked = settings.breakReminderEnabled !== false;
    breakReminderEnabled.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ breakReminderEnabled: e.target.checked });
    });
  }
  const breakReminderMinutes = document.getElementById("breakReminderMinutes");
  if (breakReminderMinutes) {
    breakReminderMinutes.value = settings.breakReminderMinutes || 1;
    breakReminderMinutes.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ breakReminderMinutes: parseInt(e.target.value) || 1 });
    });
  }
  const countdownEnabled = document.getElementById("countdownEnabled");
  if (countdownEnabled) {
    countdownEnabled.checked = settings.countdownEnabled !== false;
    countdownEnabled.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ countdownEnabled: e.target.checked });
    });
  }
  const countdownDuration = document.getElementById("countdownDuration");
  if (countdownDuration) {
    countdownDuration.value = settings.countdownDuration || 10;
    countdownDuration.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ countdownDuration: parseInt(e.target.value) || 10 });
    });
  }
  const overtimeNudgeEnabled = document.getElementById("overtimeNudgeEnabled");
  if (overtimeNudgeEnabled) {
    overtimeNudgeEnabled.checked = settings.overtimeNudgeEnabled !== false;
    overtimeNudgeEnabled.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ overtimeNudgeEnabled: e.target.checked });
    });
  }
  const overtimeNudgeShowWhenPaused = document.getElementById("overtimeNudgeShowWhenPaused");
  if (overtimeNudgeShowWhenPaused) {
    overtimeNudgeShowWhenPaused.checked = settings.overtimeNudgeShowWhenPaused !== false;
    overtimeNudgeShowWhenPaused.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ overtimeNudgeShowWhenPaused: e.target.checked });
    });
  }

  // Theme
  const colorTheme = document.getElementById("colorTheme");
  if (colorTheme) {
    colorTheme.value = settings.theme || 'dark';
    colorTheme.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ theme: e.target.value });
      applyTheme(e.target.value);
    });
  }

  // Accent color
  document.querySelectorAll(".color-option").forEach((btn) => {
    if (btn.dataset.color === settings.accentColor) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      document.querySelectorAll(".color-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const color = btn.dataset.color;
      window.electronAPI.saveSettings({ accentColor: color });
      document.documentElement.style.setProperty('--accent-color', color);
    });
  });

  // Notification sound
  const notificationSound = document.getElementById("notificationSound");
  if (notificationSound) {
    notificationSound.value = settings.notificationSound || 'bell';
    notificationSound.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ notificationSound: e.target.value });
    });
  }

  // Break background
  const breakBackground = document.getElementById("breakBackground");
  if (breakBackground) {
    breakBackground.value = settings.breakBackground || 'blur';
    breakBackground.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ breakBackground: e.target.value });
    });
  }

  // (Focus apps moved to Smart Pause view)

  // Upload custom sound
  const uploadSoundBtn = document.getElementById("uploadSound");
  if (uploadSoundBtn) {
    uploadSoundBtn.addEventListener("click", async () => {
      const result = await window.electronAPI.uploadSound();
      if (result) {
        const option = document.createElement("option");
        option.value = result.name;
        option.textContent = result.name;
        notificationSound.appendChild(option);
        notificationSound.value = result.name;
        window.electronAPI.saveSettings({ notificationSound: result.name });
      }
    });
  }

  // Preview sound
  const previewSoundBtn = document.getElementById("previewSound");
  if (previewSoundBtn) {
    previewSoundBtn.addEventListener("click", () => {
      const audio = new Audio("../../../assets/sounds/break-start.mp3");
      audio.volume = (settings.soundVolume != null ? settings.soundVolume : 30) / 100;
      previewSoundBtn.textContent = "Playing...";
      audio.play().catch(() => {});
      audio.addEventListener("ended", () => {
        previewSoundBtn.textContent = "Preview Sound";
      });
    });
  }

  // (Cooldown, away detection, video/calendar toggles moved to Smart Pause view)

  // Phase 3: Sound volume + toggles
  const soundVolume = document.getElementById("soundVolume");
  const soundVolumeLabel = document.getElementById("soundVolumeLabel");
  if (soundVolume) {
    soundVolume.value = settings.soundVolume != null ? settings.soundVolume : 80;
    if (soundVolumeLabel) soundVolumeLabel.textContent = `${soundVolume.value}%`;
    soundVolume.addEventListener("input", (e) => {
      if (soundVolumeLabel) soundVolumeLabel.textContent = `${e.target.value}%`;
      settings.soundVolume = parseInt(e.target.value);
      window.electronAPI.saveSettings({ soundVolume: parseInt(e.target.value) });
    });
  }

  const playSoundOnBreakStart = document.getElementById("playSoundOnBreakStart");
  if (playSoundOnBreakStart) {
    playSoundOnBreakStart.checked = settings.playSoundOnBreakStart !== false;
    playSoundOnBreakStart.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ playSoundOnBreakStart: e.target.checked });
    });
  }

  const playSoundOnBreakEnd = document.getElementById("playSoundOnBreakEnd");
  if (playSoundOnBreakEnd) {
    playSoundOnBreakEnd.checked = settings.playSoundOnBreakEnd !== false;
    playSoundOnBreakEnd.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ playSoundOnBreakEnd: e.target.checked });
    });
  }

  // Phase 3: Custom break messages
  const useCustomMessages = document.getElementById("useCustomMessages");
  const customMessagesContainer = document.getElementById("customMessagesContainer");
  const customMessagesList = document.getElementById("customMessagesList");
  const customMessageInput = document.getElementById("customMessageInput");
  const addCustomMessageBtn = document.getElementById("addCustomMessage");

  if (useCustomMessages) {
    useCustomMessages.checked = settings.useCustomMessages || false;
    if (customMessagesContainer) {
      customMessagesContainer.style.display = useCustomMessages.checked ? 'block' : 'none';
    }
    useCustomMessages.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ useCustomMessages: e.target.checked });
      if (customMessagesContainer) {
        customMessagesContainer.style.display = e.target.checked ? 'block' : 'none';
      }
    });
  }

  function renderCustomMessages(msgs) {
    if (!customMessagesList) return;
    customMessagesList.innerHTML = '';
    (msgs || []).forEach((msg, i) => {
      const item = document.createElement('div');
      item.className = 'focus-app-item';
      item.innerHTML = `
        <span>${msg}</span>
        <button class="remove-app" data-index="${i}">x</button>
      `;
      customMessagesList.appendChild(item);
    });
    customMessagesList.querySelectorAll('.remove-app').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        const updated = [...(settings.customBreakMessages || [])];
        updated.splice(idx, 1);
        settings.customBreakMessages = updated;
        window.electronAPI.saveSettings({ customBreakMessages: updated });
        renderCustomMessages(updated);
      });
    });
  }

  if (customMessagesList) {
    renderCustomMessages(settings.customBreakMessages || []);
  }

  if (addCustomMessageBtn && customMessageInput) {
    addCustomMessageBtn.addEventListener("click", () => {
      const msg = customMessageInput.value.trim();
      if (msg) {
        const msgs = [...(settings.customBreakMessages || []), msg];
        settings.customBreakMessages = msgs;
        window.electronAPI.saveSettings({ customBreakMessages: msgs });
        renderCustomMessages(msgs);
        customMessageInput.value = '';
      }
    });
  }

  // Phase 4: Enhanced break backgrounds
  const breakBackgroundType = document.getElementById("breakBackgroundType");
  const presetBgContainer = document.getElementById("presetBgContainer");
  const customImageContainer = document.getElementById("customImageContainer");
  const gradientContainer = document.getElementById("gradientContainer");

  function updateBgContainers(type) {
    if (presetBgContainer) presetBgContainer.style.display = type === 'preset' ? 'block' : 'none';
    if (customImageContainer) customImageContainer.style.display = type === 'custom-image' ? 'block' : 'none';
    if (gradientContainer) gradientContainer.style.display = type === 'gradient' ? 'block' : 'none';
  }

  if (breakBackgroundType) {
    breakBackgroundType.value = settings.breakBackgroundType || 'preset';
    updateBgContainers(breakBackgroundType.value);
    breakBackgroundType.addEventListener("change", (e) => {
      window.electronAPI.saveSettings({ breakBackgroundType: e.target.value });
      updateBgContainers(e.target.value);
    });
  }

  const uploadBreakImageBtn = document.getElementById("uploadBreakImage");
  const customImagePath = document.getElementById("customImagePath");
  if (settings.customBreakImage && customImagePath) {
    customImagePath.textContent = settings.customBreakImage.split('/').pop();
  }
  if (uploadBreakImageBtn) {
    uploadBreakImageBtn.addEventListener("click", async () => {
      const result = await window.electronAPI.uploadBreakImage();
      if (result) {
        settings.customBreakImage = result;
        window.electronAPI.saveSettings({ customBreakImage: result });
        if (customImagePath) customImagePath.textContent = result.split('/').pop();
      }
    });
  }

  // Gradient presets
  document.querySelectorAll("#gradientPresets .color-option").forEach((btn) => {
    if (btn.dataset.gradient === settings.breakGradient) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      document.querySelectorAll("#gradientPresets .color-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      window.electronAPI.saveSettings({ breakGradient: btn.dataset.gradient });
    });
  });

  // Phase 5: Automations
  const automationsList = document.getElementById("automationsList");
  const prebuiltAutomations = document.getElementById("prebuiltAutomations");
  const addAutomationBtn = document.getElementById("addAutomation");

  function renderAutomations(automations) {
    if (!automationsList) return;
    automationsList.innerHTML = '';
    (automations || []).filter(a => !a.prebuilt).forEach((auto) => {
      const item = document.createElement('div');
      item.className = 'focus-app-item';
      item.style.flexWrap = 'wrap';
      item.innerHTML = `
        <div style="flex: 1;">
          <span>${auto.name}</span>
          <span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;">${auto.trigger} · ${auto.type}</span>
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <label class="toggle" style="width: 36px; height: 20px;">
            <input type="checkbox" class="automation-toggle" data-id="${auto.id}" ${auto.enabled ? 'checked' : ''} />
            <span class="toggle-slider" style="border-radius: 10px;"></span>
          </label>
          <button class="remove-app test-automation" data-id="${auto.id}" style="color: var(--accent-color);">test</button>
          <button class="remove-app delete-automation" data-id="${auto.id}">x</button>
        </div>
      `;
      automationsList.appendChild(item);
    });

    automationsList.querySelectorAll('.automation-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const id = toggle.dataset.id;
        const auto = (settings.automations || []).find(a => a.id === id);
        if (auto) {
          auto.enabled = toggle.checked;
          window.electronAPI.saveAutomation(auto);
        }
      });
    });

    automationsList.querySelectorAll('.test-automation').forEach(btn => {
      btn.addEventListener('click', async () => {
        const auto = (settings.automations || []).find(a => a.id === btn.dataset.id);
        if (auto) {
          const result = await window.electronAPI.testAutomation(auto);
          btn.textContent = result.success ? 'ok!' : 'fail';
          setTimeout(() => { btn.textContent = 'test'; }, 2000);
        }
      });
    });

    automationsList.querySelectorAll('.delete-automation').forEach(btn => {
      btn.addEventListener('click', () => {
        window.electronAPI.deleteAutomation(btn.dataset.id);
        settings.automations = (settings.automations || []).filter(a => a.id !== btn.dataset.id);
        renderAutomations(settings.automations);
      });
    });
  }

  async function renderPrebuiltAutomations() {
    if (!prebuiltAutomations) return;
    const prebuilts = await window.electronAPI.getPrebuiltAutomations();
    prebuiltAutomations.innerHTML = '';
    prebuilts.forEach((auto) => {
      const existing = (settings.automations || []).find(a => a.id === auto.id);
      const isEnabled = existing ? existing.enabled : false;
      const item = document.createElement('div');
      item.className = 'toggle-row';
      item.innerHTML = `
        <span class="toggle-label">${auto.name} <span style="color: var(--text-muted); font-size: 12px;">(${auto.trigger})</span></span>
        <label class="toggle">
          <input type="checkbox" class="prebuilt-toggle" data-id="${auto.id}" ${isEnabled ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      `;
      prebuiltAutomations.appendChild(item);
    });

    prebuiltAutomations.querySelectorAll('.prebuilt-toggle').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const prebuilts = await window.electronAPI.getPrebuiltAutomations();
        const template = prebuilts.find(p => p.id === toggle.dataset.id);
        if (template) {
          template.enabled = toggle.checked;
          template.prebuilt = true;
          window.electronAPI.saveAutomation(template);
          const existing = (settings.automations || []).find(a => a.id === template.id);
          if (existing) {
            existing.enabled = toggle.checked;
          } else {
            settings.automations = [...(settings.automations || []), template];
          }
        }
      });
    });
  }

  renderAutomations(settings.automations || []);
  renderPrebuiltAutomations();

  if (addAutomationBtn) {
    addAutomationBtn.addEventListener("click", () => {
      const name = document.getElementById("automationName").value.trim();
      const script = document.getElementById("automationScript").value.trim();
      const trigger = document.getElementById("automationTrigger").value;
      const type = document.getElementById("automationType").value;

      if (name && script) {
        const automation = {
          id: `custom-${Date.now()}`,
          name,
          trigger,
          type,
          script,
          enabled: true,
        };
        settings.automations = [...(settings.automations || []), automation];
        window.electronAPI.saveAutomation(automation);
        renderAutomations(settings.automations);
        document.getElementById("automationName").value = '';
        document.getElementById("automationScript").value = '';
      }
    });
  }

  // Widget toggle
  const widgetToggle = document.getElementById("widgetToggle");
  if (widgetToggle) {
    widgetToggle.addEventListener("click", () => {
      window.electronAPI.toggleWidget();
    });
  }

  // Apply theme
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light') {
      root.style.setProperty('--bg-primary', '#ffffff');
      root.style.setProperty('--bg-secondary', '#f2f3f5');
      root.style.setProperty('--bg-tertiary', '#e3e5e8');
      root.style.setProperty('--text-primary', '#2e3338');
      root.style.setProperty('--text-secondary', '#4f5660');
    } else {
      root.style.setProperty('--bg-primary', '#36393f');
      root.style.setProperty('--bg-secondary', '#2f3136');
      root.style.setProperty('--bg-tertiary', '#202225');
      root.style.setProperty('--text-primary', '#ffffff');
      root.style.setProperty('--text-secondary', '#dcddde');
    }
  }

  // Apply initial theme
  applyTheme(settings.theme || 'dark');
  if (settings.accentColor) {
    document.documentElement.style.setProperty('--accent-color', settings.accentColor);
  }
});
