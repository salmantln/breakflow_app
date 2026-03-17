// settings.js
document.addEventListener('DOMContentLoaded', () => {
    const workDurationInput = document.getElementById('workDuration');
    const breakDurationInput = document.getElementById('breakDuration');
    const autoStartBreaksInput = document.getElementById('autoStartBreaks');
  
    // Load saved settings
    window.electronAPI.getSettings().then(settings => {
      workDurationInput.value = settings.workDuration || 20;
      breakDurationInput.value = settings.breakDuration || 5;
      autoStartBreaksInput.checked = settings.autoStartBreaks || false;
    });
  
    // Save settings when changed
    function saveSettings() {
      const settings = {
        workDuration: parseInt(workDurationInput.value),
        breakDuration: parseInt(breakDurationInput.value),
        autoStartBreaks: autoStartBreaksInput.checked
      };
      window.electronAPI.saveSettings(settings);
    }
  
    workDurationInput.addEventListener('change', saveSettings);
    breakDurationInput.addEventListener('change', saveSettings);
    autoStartBreaksInput.addEventListener('change', saveSettings);
  
    // Handle sidebar navigation
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelector('.sidebar-item.active').classList.remove('active');
        item.classList.add('active');
        // TODO: Add content switching logic
      });
    });
  });