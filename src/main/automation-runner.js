const { exec } = require('child_process');

class AutomationRunner {
  constructor(options = {}) {
    this.debug = options.debug || false;
  }

  log(...args) {
    if (this.debug) console.log('[AutomationRunner]', ...args);
  }

  async runAutomations(trigger, automations) {
    // Filter automations by trigger and enabled status
    const matching = (automations || []).filter(a => a.trigger === trigger && a.enabled);

    for (const automation of matching) {
      try {
        await this.execute(automation);
        this.log(`Automation "${automation.name}" completed`);
      } catch (err) {
        this.log(`Automation "${automation.name}" failed:`, err.message);
      }
    }
  }

  execute(automation) {
    return new Promise((resolve, reject) => {
      let cmd;
      const timeout = 10000; // 10s timeout

      switch (automation.type) {
        case 'applescript':
          if (process.platform !== 'darwin') {
            resolve(); // Skip on non-macOS
            return;
          }
          cmd = `osascript -e '${automation.script.replace(/'/g, "'\\''")}'`;
          break;
        case 'shortcut':
          if (process.platform !== 'darwin') {
            resolve();
            return;
          }
          cmd = `shortcuts run "${automation.script}"`;
          break;
        case 'shell':
          cmd = automation.script;
          break;
        default:
          reject(new Error(`Unknown automation type: ${automation.type}`));
          return;
      }

      exec(cmd, { timeout }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  // Pre-built automation templates
  static getPrebuiltAutomations() {
    return [
      {
        id: 'pause-spotify',
        name: 'Pause Spotify',
        trigger: 'break-start',
        type: 'applescript',
        script: 'tell application "Spotify" to pause',
        enabled: false,
      },
      {
        id: 'resume-spotify',
        name: 'Resume Spotify',
        trigger: 'break-end',
        type: 'applescript',
        script: 'tell application "Spotify" to play',
        enabled: false,
      },
      {
        id: 'slack-break-status',
        name: 'Set Slack Break Status',
        trigger: 'break-start',
        type: 'applescript',
        script: 'tell application "Slack" to activate',
        enabled: false,
      },
      {
        id: 'slack-clear-status',
        name: 'Clear Slack Status',
        trigger: 'break-end',
        type: 'applescript',
        script: 'tell application "Slack" to activate',
        enabled: false,
      },
      {
        id: 'dnd-on',
        name: 'Enable Do Not Disturb',
        trigger: 'break-start',
        type: 'shell',
        script: process.platform === 'darwin' ? 'shortcuts run "Turn On Focus"' : '',
        enabled: false,
      },
      {
        id: 'dnd-off',
        name: 'Disable Do Not Disturb',
        trigger: 'break-end',
        type: 'shell',
        script: process.platform === 'darwin' ? 'shortcuts run "Turn Off Focus"' : '',
        enabled: false,
      },
    ];
  }
}

module.exports = AutomationRunner;
