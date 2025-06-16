// Updated simple-detector.js with more accurate meeting detection

const { exec, execSync } = require('child_process');
const { desktopCapturer } = require('electron');

class SimpleTeamsDetector {
  constructor(options = {}) {
    this.checkIntervalMs = options.checkIntervalMs || 10000;
    this.onMeetingStart = options.onMeetingStart || (() => {});
    this.onMeetingEnd = options.onMeetingEnd || (() => {});
    this.isInMeeting = false;
    this.checkInterval = null;
    this.debug = options.debug || false;
    this.meetingConfirmCount = 0; // Counter for confirming meeting state changes
    this.requiredConfirmations = 2; // Number of consecutive detections needed to confirm
  }

  // Start monitoring
  start() {
    this.checkForTeamsMeeting(); // Check immediately
    this.checkInterval = setInterval(() => this.checkForTeamsMeeting(), this.checkIntervalMs);
    console.log('Teams detector started');
    return this;
  }

  // Stop monitoring
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('Teams detector stopped');
    return this;
  }

  // Main detection method with improved accuracy
  async checkForTeamsMeeting() {
    try {
      const wasInMeeting = this.isInMeeting;
      let inMeetingNow = false;
      
      // Try both detection methods
      const windowDetection = await this.safeDetect('window');
      const processDetection = await this.safeDetect('process');
      
      if (this.debug) {
        console.log(`Detection results - Window: ${windowDetection}, Process: ${processDetection}`);
      }
      
      // Consider in meeting only if both methods agree OR if window detection is very confident
      inMeetingNow = (windowDetection && processDetection);
      
      // State machine to prevent false detections
      if (wasInMeeting !== inMeetingNow) {
        // Potential state change detected
        this.meetingConfirmCount++;
        
        if (this.debug) {
          console.log(`Potential state change detected (${inMeetingNow ? 'start' : 'end'}). Confirmation count: ${this.meetingConfirmCount}/${this.requiredConfirmations}`);
        }
        
        // Only trigger callback after multiple consecutive confirmations
        if (this.meetingConfirmCount >= this.requiredConfirmations) {
          this.isInMeeting = inMeetingNow;
          this.meetingConfirmCount = 0;
          
          if (inMeetingNow) {
            console.log('Teams meeting started (confirmed)');
            this.onMeetingStart();
          } else {
            console.log('Teams meeting ended (confirmed)');
            this.onMeetingEnd();
          }
        }
      } else {
        // Reset confirmation counter if state is stable
        this.meetingConfirmCount = 0;
      }
    } catch (err) {
      console.error('Error checking for Teams meeting:', err);
    }
  }
  
  // Safely run a detection method without crashing
  async safeDetect(method) {
    try {
      if (method === 'window') {
        return await this.detectViaWindow();
      } else if (method === 'process') {
        return await this.detectViaProcess();
      }
      return false;
    } catch (err) {
      console.error(`Error in ${method} detection:`, err);
      return false;
    }
  }

// Updated window detection method for more accurate meeting detection

// Simple window title detection with improved accuracy
async detectViaWindow() {
    try {
      // Get all windows
      const sources = await desktopCapturer.getSources({ 
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 }
      });
      
      if (this.debug) {
        console.log('Current windows:', sources.map(s => s.name));
      }
      
      // Much more specific meeting indicators
      const meetingIndicators = [
        'meeting in progress',
        'meeting | microsoft teams',
        'teams meeting',
        'join now',
        'call | microsoft teams',
        'video call',
        'teams call'
      ];
      
      // Titles that should be excluded (not meetings)
      const exclusions = [
        'chat | microsoft teams',
        'teams chat',
        'claude',
        'about teams',
        'teams settings'
      ];
      
      for (const source of sources) {
        const title = source.name.toLowerCase();
        
        // First check if this is an explicitly excluded window
        if (exclusions.some(exclusion => title.includes(exclusion))) {
          if (this.debug) {
            console.log('Excluded window found:', source.name);
          }
          continue; // Skip this window
        }
        
        // Check for specific meeting indicators
        if (title.includes('microsoft teams') || title.includes('teams')) {
          // For Teams windows, require a specific meeting indicator
          if (meetingIndicators.some(indicator => title.includes(indicator))) {
            if (this.debug) {
              console.log('Meeting window found:', source.name);
            }
            return true;
          }
        }
      }
      
      return false;
    } catch (err) {
      console.error('Window detection error:', err);
      throw err;
    }
  }
  
  // Improved process detection with additional verification
  async detectViaProcess() {
    try {
      // First check if Teams is running
      const command = process.platform === 'darwin' 
        ? "ps -ax | grep 'Microsoft Teams' | grep -v grep || echo ''" 
        : "tasklist | findstr Teams || echo ''";
      
      if (this.debug) {
        console.log(`Executing: ${command}`);
      }
      
      // Check if Teams is running
      const teamsRunningResult = await new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
          if (this.debug) {
            console.log(`Process output: "${stdout.trim()}"`);
          }
          
          // Check if Teams is running (output will be empty if not)
          const isTeamsRunning = stdout.trim().length > 0;
          resolve(isTeamsRunning);
        });
      });
      
      if (!teamsRunningResult) {
        return false; // Teams isn't running at all
      }
      
      // Teams is running, but is it in a meeting?
      // Check for camera/microphone usage on macOS
      if (process.platform === 'darwin') {
        try {
          // Check if Teams is using camera or microphone (might indicate a meeting)
          const mediaCmdMac = "ps -ax -o command | grep 'Teams.*icrophone\\|Teams.*amera' | grep -v grep || echo ''";
          
          const mediaResult = await new Promise((resolve) => {
            exec(mediaCmdMac, (error, stdout, stderr) => {
              const usingMedia = stdout.trim().length > 0;
              if (this.debug && usingMedia) {
                console.log('Teams appears to be using media devices:', stdout.trim());
              }
              resolve(usingMedia);
            });
          });
          
          // If media is being used, it's likely a meeting
          if (mediaResult) {
            return true;
          }
        } catch (mediaErr) {
          if (this.debug) {
            console.log('Media check failed:', mediaErr);
          }
        }
      }
      
      // Check Teams CPU usage - meeting typically uses more CPU
      try {
        const cpuCmd = process.platform === 'darwin'
          ? "ps -ax -o %cpu,command | grep 'Microsoft Teams' | grep -v grep | awk '{print $1}' || echo '0'"
          : "powershell \"Get-Process Teams | Select-Object -ExpandProperty CPU\" || echo 0";
        
        const cpuResult = await new Promise((resolve) => {
          exec(cpuCmd, (error, stdout, stderr) => {
            // Parse CPU value (first line, first column should be CPU %)
            const cpuValue = parseFloat(stdout.trim());
            if (this.debug) {
              console.log(`Teams CPU usage: ${cpuValue}%`);
            }
            
            // If CPU usage is significant, might be in a meeting
            // Adjust threshold based on your testing
            resolve(cpuValue > 10);
          });
        });
        
        return cpuResult;
      } catch (cpuErr) {
        if (this.debug) {
          console.log('CPU check failed:', cpuErr);
        }
      }
      
      // If we got here, Teams is running but we couldn't confirm a meeting
      // Return false to avoid false positives
      return false;
    } catch (err) {
      console.error('Process detection error:', err);
      throw err;
    }
  }
}

module.exports = SimpleTeamsDetector;