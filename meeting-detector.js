const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

class TeamsMeetingDetector {
    constructor(options = {}) {
        this.checkIntervalMs = options.checkIntervalMs || 5000;
        this.detectionMethods = options.detectionMethods || ['process', 'window', 'audio', 'browser'];
        this.onMeetingStart = options.onMeetingStart || (() => console.log('Teams meeting started'));
        this.onMeetingEnd = options.onMeetingEnd || (() => console.log('Teams meeting ended'));
        this.isInMeeting = false;
        this.checkInterval = null;
        this.potentialEndCounter = 0;
        this.debug = options.debug || false;
    }

    start() {
        this.checkInterval = setInterval(() => this.checkForTeamsMeeting(), this.checkIntervalMs);
        return this;
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        return this;
    }

    async checkForTeamsMeeting() {
        const wasInMeeting = this.isInMeeting;
        let inMeetingNow = false;
        let detectionResults = {};

        // Try ALL detection methods and collect their results
        for (const method of this.detectionMethods) {
            try {
                switch (method) {
                    case 'process':
                        detectionResults.process = await this.detectViaProcess();
                        break;
                    case 'window':
                        detectionResults.window = await this.detectViaWindow();
                        break;
                    case 'audio':
                        detectionResults.audio = await this.detectViaAudio();
                        break;
                    case 'browser':
                        detectionResults.browser = await this.detectTeamsInBrowser();
                        break;
                }
            } catch (err) {
                console.error(`Error in detection method ${method}:`, err);
                detectionResults[method] = false;
            }
        }

        // Log detection results for debugging
        console.log('Meeting detection results:', detectionResults);

        // Consider in meeting if ANY method returns true
        inMeetingNow = Object.values(detectionResults).some(result => result === true);

        // Add hysteresis to prevent rapid switching
        // Only declare meeting ended if we've detected "not in meeting" multiple times
        if (wasInMeeting && !inMeetingNow) {
            if (!this.potentialEndCounter) {
                this.potentialEndCounter = 1;
            } else {
                this.potentialEndCounter++;
            }

            // Require 2 consecutive negative detections to confirm meeting end
            if (this.potentialEndCounter >= 2) {
                this.isInMeeting = false;
                this.potentialEndCounter = 0;
                this.onMeetingEnd();
                console.log('Meeting end confirmed after multiple checks');
            } else {
                console.log('Potential meeting end detected, waiting for confirmation...');
                return; // Don't update isInMeeting yet
            }
        } else {
            // Reset counter if we're definitely in a meeting
            this.potentialEndCounter = 0;

            // Update state and trigger callback if changed
            if (!wasInMeeting && inMeetingNow) {
                this.isInMeeting = true;
                this.onMeetingStart();
            } else {
                this.isInMeeting = inMeetingNow;
            }
        }
    }

    // Method 1: Detect Teams via process names and resource usage
    async detectViaProcess() {
        try {
            let teamsRunningCommand;
            let meetingDetectionCommand;

            switch (process.platform) {
                case 'win32':
                    teamsRunningCommand = 'tasklist /FI "IMAGENAME eq Teams.exe" /FO CSV';
                    meetingDetectionCommand = 'powershell "Get-Process Teams | Select-Object CPU, WorkingSet | ConvertTo-Csv"';
                    break;
                case 'darwin': // macOS
                    // Fix: Use correct ps syntax for macOS
                    teamsRunningCommand = 'ps -ax | grep "Microsoft Teams" | grep -v grep || true';
                    meetingDetectionCommand = 'ps -ax -o %cpu,command | grep "Microsoft Teams" | grep -v grep || true';
                    break;
                case 'linux':
                    teamsRunningCommand = 'ps -A | grep -i "teams" | grep -v grep || true';
                    meetingDetectionCommand = 'ps -C teams -o %cpu= || true';
                    break;
                default:
                    throw new Error('Unsupported platform');
            }

            // Add debug output
            if (this.debug) {
                console.log(`Executing command: ${teamsRunningCommand}`);
            }

            // Execute with error handling
            let teamsOutput;
            try {
                teamsOutput = execSync(teamsRunningCommand, { encoding: 'utf8', timeout: 5000 });
            } catch (e) {
                // Command exit code might be non-zero if grep finds nothing
                // This is normal and shouldn't throw an error
                if (this.debug) {
                    console.log('Command returned non-zero, but this may be normal:', e.message);
                }
                teamsOutput = '';
            }

            const isTeamsRunning = teamsOutput.trim().length > 0;

            if (this.debug) {
                console.log(`Teams running check: ${isTeamsRunning}`);
                console.log(`Command output: "${teamsOutput.trim()}"`);
            }

            // If Teams isn't running, definitely not in a meeting
            if (!isTeamsRunning) {
                return false;
            }

            // Teams is running, now check more specific indicators
            try {
                if (process.platform === 'win32') {
                    // Windows specific detection
                    // ...existing Windows code...
                } else if (process.platform === 'darwin' || process.platform === 'linux') {
                    // For macOS and Linux, check CPU usage as indicator
                    try {
                        let usageOutput = '';
                        try {
                            usageOutput = execSync(meetingDetectionCommand, { encoding: 'utf8', timeout: 3000 });
                        } catch (e) {
                            if (this.debug) console.log('CPU check command failed, but continuing:', e.message);
                            usageOutput = '';
                        }

                        // Parse CPU usage from output
                        const cpuMatch = usageOutput.match(/(\d+\.\d+)/);
                        const cpuUsage = cpuMatch ? parseFloat(cpuMatch[1]) : 0;

                        if (this.debug) {
                            console.log(`Teams CPU usage: ${cpuUsage}%`);
                        }

                        // Consider in meeting if CPU usage is significant
                        return cpuUsage > 5; // Adjust threshold as needed
                    } catch (e) {
                        if (this.debug) console.log('CPU usage check failed:', e.message);
                    }
                }
            } catch (resourceErr) {
                if (this.debug) console.log('Resource check error:', resourceErr);
            }

            // Fall back to just Teams running if detailed checks fail
            return isTeamsRunning;
        } catch (err) {
            console.error('Process detection error:', err);
            return false;
        }
    }

    // Method 2: Detect Teams via window titles
    async detectViaWindow() {
        try {
            // Get all windows
            const sources = await desktopCapturer.getSources({
                types: ['window'],
                thumbnailSize: { width: 0, height: 0 }
            });

            // Look for Teams meeting window indicators
            const meetingIndicators = [
                'Meeting | Microsoft Teams',
                'Microsoft Teams Meeting',
                'Teams Meeting',
                ' - Meeting in progress',
                'meeting in progress',
                '| Microsoft Teams',
                'Join now',
                'calling',
                'video call'
            ];

            if (this.debug) {
                console.log('Current window titles:', sources.map(s => s.name));
            }

            for (const source of sources) {
                const title = source.name.toLowerCase();

                // Check if it's a Teams window
                if (title.includes('teams')) {
                    // Check if it has meeting indicators 
                    if (meetingIndicators.some(indicator =>
                        source.name.toLowerCase().includes(indicator.toLowerCase()))) {
                        if (this.debug) {
                            console.log('Meeting window detected:', source.name);
                        }
                        return true;
                    }
                }
            }

            return false;
        } catch (err) {
            console.error('Window detection error:', err);
            return false;
        }
    }

    // Method 3: Detect Teams via audio activity
    async detectViaAudio() {
        try {
            // This is a more advanced approach that requires additional permissions
            // Get audio metrics (if your app has audio permissions)
            const audioSources = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = audioSources.filter(device => device.kind === 'audioinput');

            // If mic appears to be in use (needs additional implementation)
            // This is a simplified placeholder - actual implementation would need to analyze audio levels
            if (audioInputs.length > 0) {
                // Check if the system audio shows high usage
                // This is platform-specific and would require deeper integration
                if (process.platform === 'win32') {
                    // PowerShell command to check audio usage
                    exec('powershell "Get-AudioDevice -PlaybackVolume"', (error, stdout) => {
                        if (!error && stdout) {
                            // Parse the output to determine if audio is active
                            // This is a simplified check - real implementation would be more sophisticated
                            return stdout.includes('Teams') || stdout.includes('Microsoft');
                        }
                        return false;
                    });
                }
            }

            return false;
        } catch (err) {
            console.error('Audio detection error:', err);
            return false;
        }
    }

    // Method 4: Detect Teams in browser (for web meetings)
    async detectTeamsInBrowser() {
        // For Electron apps that might have access to browser tabs
        try {
            const allWindows = BrowserWindow.getAllWindows();

            for (const window of allWindows) {
                const url = window.webContents.getURL();

                // Check if the URL matches Teams web meeting patterns
                if (url.includes('teams.microsoft.com') &&
                    (url.includes('/meeting/') || url.includes('/_#/calling'))) {
                    return true;
                }
            }

            return false;
        } catch (err) {
            console.error('Browser detection error:', err);
            return false;
        }
    }
}

// Usage example
module.exports = TeamsMeetingDetector;

// Example usage:
/*
const detector = new TeamsMeetingDetector({
  checkIntervalMs: 10000, // Check every 10 seconds
  detectionMethods: ['window', 'process', 'audio', 'browser'],
  debug: true, // Enable detailed logging
  onMeetingStart: () => {
    console.log('Teams meeting detected! Adjusting app behavior...');
    // Your logic here - e.g., pause notifications, etc.
  },
  onMeetingEnd: () => {
    console.log('Teams meeting ended. Resuming normal operation...');
    // Your logic here
  }
});

detector.start();

// Make sure to stop the detector when your app closes
app.on('will-quit', () => {
  detector.stop();
});
*/