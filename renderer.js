// renderer.js (create this new file)

// const { ipcRenderer } = require('electron')

document.addEventListener("DOMContentLoaded", () => {
  // Get all navigation items and content sections
  const navItems = document.querySelectorAll(".nav-item");
  const contentSections = document.querySelectorAll(".content-container");
  const minimizeBtn = document.getElementById("minimize-button");
  const maximizeBtn = document.getElementById("maximize-button");

  if (!minimizeBtn || !maximizeBtn) {
    console.error("Buttons not found!");
    return;
  }

  minimizeBtn.addEventListener("click", () => {
    console.log("Minimize clicked");
    window.electronAPI.minimizeWindow();
  });

  maximizeBtn.addEventListener("click", () => {
    console.log("Maximize clicked");
    window.electronAPI.maximizeWindow();
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
      const viewId = item.getAttribute("data-view");
      switchContent(viewId);
    });
  });

  // Timer logic
  let time = 20 * 60;
  let timerInterval;
  let isRunning = false;
  let defaultMinutes = 20;

  function checkBreakTime(seconds) {
    if (seconds === 5) {
      console.log("Break notification triggered"); // Debug log
      window.electronAPI.notifyBreaktime();
    }
  }

  function updateDisplay(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const newTime = `${String(minutes).padStart(2, "0")}:${String(
      secs
    ).padStart(2, "0")}`;
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
        const currentTop = parseInt(chars[i].style.top || "0");
        chars[i].style.top = `${currentTop - 1}px`;
        chars[i].style.opacity = "0";
        chars[i].style.fontSize = "65px";

        setTimeout(() => {
          chars[i].textContent = char;
          chars[i].style.top = "0px";
          chars[i].style.opacity = "1";
          chars[i].style.fontSize = "72px";
        }, 200);
      }
    });

    window.electronAPI.updateTimer(seconds);
    if (seconds <= 0) {
      pauseTimer();
      window.electronAPI.startBreak();
    }
  }

  function startTimer() {
    if (!isRunning) {
      clearInterval(timerInterval); // Clear any existing interval first
      isRunning = true;
      timerInterval = setInterval(() => {
        time--;
        updateDisplay(time);
      }, 1000);
    }
  }

  function resetTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    time = defaultMinutes * 60;
    updateDisplay(time);
  }

  function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
  }

  // Settings handlers
  const workDurationInput = document.getElementById("workDuration");
  if (workDurationInput) {
    workDurationInput.addEventListener("change", (e) => {
      defaultMinutes = parseInt(e.target.value) || 20;
      resetTimer();
    });
  }

  const minutesInput = document.getElementById("minutesInput");
  if (minutesInput) {
    minutesInput.addEventListener("change", (e) => {
      defaultMinutes = parseInt(e.target.value) || 20;
      resetTimer();
    });
  }

  // Make timer functions available globally
  window.startTimer = startTimer;
  window.pauseTimer = pauseTimer;
  window.resetTimer = resetTimer;

  // Show timer view by default
  switchContent("timer");

  // Timer restart handler
  window.electronAPI.onTimerRestart(() => {
    time = defaultMinutes * 60;
    updateDisplay(time);
    // startTimer();
    isRunning = false;
  });

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

  const breakDurationInput = document.getElementById("breakDuration");

  window.electronAPI.getSettings().then((settings) => {
    breakDurationInput.value = settings.breakDuration || 6;
  });

  // Save when changed
  breakDurationInput.addEventListener("change", (e) => {
    const breakDuration = parseInt(e.target.value) || 5;

    console.log(breakDuration);

    window.electronAPI.saveSettings({
      breakDuration: breakDuration,
    });
  });
});
