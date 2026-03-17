// break-overlay.js
document.addEventListener("DOMContentLoaded", async () => {
  const timerDisplay = document.getElementById("timer");
  const skipButton = document.getElementById("skip");
  const lockButton = document.getElementById("lock");
  const delay1Button = document.getElementById("delay1");
  const delay5Button = document.getElementById("delay5");
  const messageEl = document.getElementById("message");
  const exerciseNameEl = document.getElementById("exercise-name");
  const exerciseDescEl = document.getElementById("exercise-desc");

  const startSound = new Audio();
  startSound.src = "../../../assets/sounds/break-start.mp3";
  const endSound = new Audio();
  endSound.src = "../../../assets/sounds/break-end.mp3";

  // Motivational messages
  const messages = [
    "Rest your eyes and stretch",
    "Look at something 20 feet away",
    "Take a deep breath",
    "Roll your shoulders back",
    "Stand up and move around",
    "Hydrate — grab some water",
    "Close your eyes for a moment",
    "Give your mind a break",
    "Relax your jaw and face muscles",
    "Let your eyes rest",
  ];

  // Exercise tips
  const exercises = [
    { name: "20-20-20 Rule", desc: "Look at something 20 feet away for 20 seconds" },
    { name: "Neck Stretch", desc: "Slowly tilt your head to each side, hold for 10 seconds" },
    { name: "Shoulder Rolls", desc: "Roll your shoulders forward 5 times, then backward 5 times" },
    { name: "Wrist Circles", desc: "Rotate your wrists in circles, 10 times each direction" },
    { name: "Standing Stretch", desc: "Stand up, reach for the ceiling, hold for 10 seconds" },
    { name: "Eye Palming", desc: "Cover your eyes with your palms, relax for 30 seconds" },
    { name: "Deep Breathing", desc: "Breathe in for 4 seconds, hold 4, out for 4" },
    { name: "Torso Twist", desc: "Twist your upper body left and right, hold each for 5 seconds" },
    { name: "Leg Stretch", desc: "Extend one leg, point and flex your foot. Switch legs" },
    { name: "Back Stretch", desc: "Interlace your fingers, push palms forward, round your back" },
  ];

  // Show random message and exercise
  messageEl.textContent = messages[Math.floor(Math.random() * messages.length)];
  const exercise = exercises[Math.floor(Math.random() * exercises.length)];
  exerciseNameEl.textContent = exercise.name;
  exerciseDescEl.textContent = exercise.desc;

  // Apply settings
  const settings = await window.electronAPI.getSettings();

  // Custom break messages
  if (settings.useCustomMessages && settings.customBreakMessages && settings.customBreakMessages.length > 0) {
    messageEl.textContent = settings.customBreakMessages[Math.floor(Math.random() * settings.customBreakMessages.length)];
  }

  // Sound volume
  const volume = (settings.soundVolume != null ? settings.soundVolume : 80) / 100;
  startSound.volume = volume;
  endSound.volume = volume;

  // Apply background
  const bgType = settings.breakBackgroundType || 'preset';
  document.body.className = '';

  if (bgType === 'custom-image' && settings.customBreakImage) {
    document.body.style.backgroundImage = `url('file://${settings.customBreakImage}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.classList.add('bg-custom-image');
  } else if (bgType === 'gradient' && settings.breakGradient) {
    document.body.style.background = settings.breakGradient;
  } else {
    // Preset
    const bgStyle = settings.breakBackground || 'blur';
    const bgMap = {
      'blur': 'bg-blur',
      'calm-blue': 'bg-calm-blue',
      'sunset': 'bg-sunset',
      'nature': 'bg-nature',
      'dim': 'bg-dim',
      'solid': 'bg-solid',
    };
    document.body.classList.add(bgMap[bgStyle] || 'bg-calm-blue');
  }

  let breakTimer;
  let timerInterval;

  async function startBreakTimer() {
    breakTimer = (settings.breakDuration || 5) * 60;
    updateDisplay();
    if (settings.playSoundOnBreakStart !== false) {
      startSound.play().catch(() => {});
    }

    timerInterval = setInterval(() => {
      breakTimer--;
      updateDisplay();

      if (breakTimer <= 0) {
        if (settings.playSoundOnBreakEnd !== false) {
          endSound.play().catch(() => {});
        }
        clearInterval(timerInterval);
        window.electronAPI.endBreak();
      }
    }, 1000);
  }

  function updateDisplay() {
    const minutes = Math.floor(breakTimer / 60);
    const seconds = breakTimer % 60;
    const timeString = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    timerDisplay.textContent = timeString;

    const totalSeconds = (settings.breakDuration || 5) * 60;
    window.electronAPI.updateBreakProgress({
      percent: (breakTimer / totalSeconds) * 100,
      timeLeft: timeString,
    });
  }

  window.electronAPI.onSettingsUpdated((event, newSettings) => {
    if (newSettings.breakDuration) {
      breakTimer = newSettings.breakDuration * 60;
      if (timerInterval) {
        clearInterval(timerInterval);
        startBreakTimer();
      }
    }
  });

  // Delay buttons
  delay1Button.addEventListener("click", () => {
    clearInterval(timerInterval);
    window.electronAPI.delayBreak(1);
  });

  delay5Button.addEventListener("click", () => {
    clearInterval(timerInterval);
    window.electronAPI.delayBreak(5);
  });

  // Skip button
  skipButton.addEventListener("click", () => {
    endSound.play().catch(() => {});
    clearInterval(timerInterval);
    window.electronAPI.endBreak();
  });

  // Lock button
  lockButton.addEventListener("click", () => {
    window.electronAPI.lockScreen();
  });

  // Double-Esc to skip
  let lastEscPress = 0;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const now = Date.now();
      if (now - lastEscPress <= 500) {
        endSound.play().catch(() => {});
        clearInterval(timerInterval);
        window.electronAPI.endBreak();
      }
      lastEscPress = now;
    }
  });

  // Start
  startBreakTimer();

  window.addEventListener("unload", () => {
    clearInterval(timerInterval);
  });
});
