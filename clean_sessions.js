#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🧹 [Cleanup] Starting OpenClaw Game Sessions Cleanup...');

const home = os.homedir();
const openclawDir = path.join(home, '.openclaw');
const sessionsJsonPath = path.join(openclawDir, 'sessions.json');
const targetLabel = 'domain-expansion-ar-game';

let sessionsDeleted = 0;
let filesDeleted = 0;

// 1. Clean from sessions.json database
if (fs.existsSync(sessionsJsonPath)) {
    try {
        const rawData = fs.readFileSync(sessionsJsonPath, 'utf8');
        const sessions = JSON.parse(rawData);
        const originalCount = Object.keys(sessions).length;
        
        const filteredSessions = {};
        for (const [key, value] of Object.entries(sessions)) {
            if (key.includes(targetLabel)) {
                sessionsDeleted++;
            } else {
                filteredSessions[key] = value;
            }
        }

        if (sessionsDeleted > 0) {
            fs.writeFileSync(sessionsJsonPath, JSON.stringify(filteredSessions, null, 2), 'utf8');
            console.log(`✅ [Database] Removed ${sessionsDeleted} sessions containing '${targetLabel}' from sessions.json.`);
        } else {
            console.log(`ℹ️ [Database] No sessions with '${targetLabel}' found in sessions.json.`);
        }
    } catch (err) {
        console.error(`❌ [Database Error] Failed to process sessions.json:`, err.message);
    }
} else {
    console.log(`ℹ️ [Database] sessions.json does not exist at ${sessionsJsonPath}. Skipping.`);
}

// 2. Clean transcript/session files under agents directory
const agentsDir = path.join(openclawDir, 'agents');
if (fs.existsSync(agentsDir)) {
    try {
        const agents = fs.readdirSync(agentsDir);
        for (const agent of agents) {
            const agentSessionsDir = path.join(agentsDir, agent, 'sessions');
            if (fs.existsSync(agentSessionsDir)) {
                const sessionFiles = fs.readdirSync(agentSessionsDir);
                for (const file of sessionFiles) {
                    if (file.includes(targetLabel)) {
                        const filePath = path.join(agentSessionsDir, file);
                        fs.unlinkSync(filePath);
                        filesDeleted++;
                    }
                }
            }
        }
        if (filesDeleted > 0) {
            console.log(`✅ [Filesystem] Deleted ${filesDeleted} transcript/session files matching '${targetLabel}' under ~/.openclaw/agents/.`);
        } else {
            console.log(`ℹ️ [Filesystem] No session files matching '${targetLabel}' found.`);
        }
    } catch (err) {
        console.error(`❌ [Filesystem Error] Failed to clean agent session files:`, err.message);
    }
} else {
    console.log(`ℹ️ [Filesystem] ~/.openclaw/agents/ directory does not exist. Skipping.`);
}

console.log(`✨ [Cleanup Complete] Purged ${sessionsDeleted} database entries and ${filesDeleted} files. All clean!`);
