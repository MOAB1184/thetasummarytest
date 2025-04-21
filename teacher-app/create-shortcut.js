const fs = require('fs');
const path = require('path');
const os = require('os');

function createDesktopShortcut() {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Teacher App.lnk');
    const appPath = path.join(__dirname, 'start-app.bat');

    // Create the shortcut content
    const shortcutContent = `@echo off
cd /d "${__dirname}"
start "" "${appPath}"`;

    // Write the shortcut file
    fs.writeFileSync(shortcutPath, shortcutContent);
    console.log('Desktop shortcut created successfully!');
}

createDesktopShortcut(); 