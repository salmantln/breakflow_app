// break-timer.js
document.addEventListener("DOMContentLoaded", async () => {
  const timerDisplay = document.getElementById("timer");
  const skipButton = document.getElementById("skip");
  const lockButton = document.getElementById("lock");

  const startSound = new Audio();
  startSound.src = "./sounds/break-start.mp3";

  const endSound = new Audio();
  endSound.src = "./sounds/break-end.mp3";

  let breakTimer;
  let timerInterval;

  async function startBreakTimer() {
    // Get duration from settings
    const settings = await window.electronAPI.getSettings();
    breakTimer = (settings.breakDuration || 5) * 60;
    updateDisplay();
    startSound.play().catch((err) => console.log("Audio play failed:", err));

    timerInterval = setInterval(() => {
      breakTimer--;
      updateDisplay();

      if (breakTimer <= 0) {
        endSound.play().catch((err) => console.log("Audio play failed:", err));
        clearInterval(timerInterval);
        window.electronAPI.endBreak();
      }
    }, 1000);
  }

  window.electronAPI.onSettingsUpdated((event, settings) => {
    breakTimer = settings.breakDuration * 60; // Convert minutes to seconds
    if (timerInterval) {
      clearInterval(timerInterval);
      startBreakTimer();
    }
  });

  async function updateDisplay() {
    const minutes = Math.floor(breakTimer / 60);
    const seconds = breakTimer % 60;
    const timeString = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
    
    timerDisplay.textContent = timeString;



    if (breakTimer <= 0) {
      clearInterval(timerInterval);
      window.electronAPI.endBreak();
      window.electronAPI.restartMainTimer();
    }

    const settings = await window.electronAPI.getSettings();
    const totalSeconds = (settings.breakDuration || 5) * 360;
    window.electronAPI.updateBreakProgress({
      percent: (breakTimer / totalSeconds) * 100,
      timeLeft: timeString,
    });
  }

  // Handle skip button
  skipButton.addEventListener("click", () => {
    endSound.play().catch((err) => console.log("Audio play failed:", err));
    clearInterval(timerInterval);
    window.electronAPI.skipBreak();
    window.electronAPI.endBreak();
    window.electronAPI.restartMainTimer();
  });

  // Handle lock button
  lockButton.addEventListener("click", () => {
    window.electronAPI.lockScreen();
  });

  // Handle Esc key
  let lastEscPress = 0;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const now = Date.now();
      if (now - lastEscPress <= 300) {
        endSound.play().catch((err) => console.log("Audio play failed:", err));
        clearInterval(timerInterval);
        window.electronAPI.restartMainTimer();
        window.electronAPI.skipBreak();
      }
      lastEscPress = now;
    }
  });

  // Start the timer
  startBreakTimer();

  // Cleanup on window close
  window.addEventListener("unload", () => {
    clearInterval(timerInterval);
  });
});
