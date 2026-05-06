---
name: Taking and Analyzing Screenshots
description: Use this to capture screen context.
---

# Taking and Analyzing Screenshots

## Overview

You CAN take screenshots by combining the Bash tool with platform-specific screenshot commands. Screenshots are saved as image files, then loaded into your context using the Read tool for visual analysis.

## When to Use

Use this skill when I ask you to:

- "Take a screenshot"
- "Look at my screen"
- "Analyze this UI bug visually"
- "Review what's currently displayed"
- "Capture and examine the interface"

## Quick Reference

| Platform | Command                                  | Interactive Selection      |
| -------- | ---------------------------------------- | -------------------------- |
| macOS    | `screencapture`                          | `-i` flag (area selection) |
| Linux    | `gnome-screenshot`, `scrot`, or `import` | `-a` or `-s` flag          |

**Standard workflow**:

1. Detect platform with `uname -s`
2. Check for available screenshot tool
3. Capture to `/tmp/screenshot_$(date +%s).png`
4. Use Read tool with the file path
5. Analyze the image
6. Optionally clean up temp file

## Step-by-Step Instructions

### 1. Detect Platform

```bash
uname -s
```

- Returns `Darwin` for macOS
- Returns `Linux` for Linux

### 2. Check Available Tools

**macOS**: `screencapture` is always available (built-in)

**Linux**: Check in priority order:

```bash
which gnome-screenshot || which scrot || which import || echo "none"
```

Priority order (best compatibility):

1. `gnome-screenshot` - works on both X11 and Wayland
2. `scrot` - lightweight, X11 only
3. `import` - part of ImageMagick

### 3. Capture Screenshot

Use timestamped filename to avoid conflicts:

**macOS**:

```bash
screencapture -i /tmp/screenshot_$(date +%s).png
```

- `-i` enables interactive area selection
- User clicks and drags to select region

**Linux with gnome-screenshot**:

```bash
gnome-screenshot -af /tmp/screenshot_$(date +%s).png
```

- `-a` for area selection
- `-f` specifies filename

**Linux with scrot**:

```bash
scrot -s /tmp/screenshot_$(date +%s).png
```

- `-s` enables selection mode

**Linux with import**:

```bash
import /tmp/screenshot_$(date +%s).png
```

- Provides crosshair for click-and-drag selection

### 4. Load Image into Context

```bash
Read tool: file_path="/tmp/screenshot_12345.png"
```

The Read tool displays images visually. You'll see the screenshot and can analyze it.

### 5. Analyze the Image

Once loaded, you can:

- Identify UI elements
- Spot visual bugs
- Review design elements
- Read text content
- Examine layout issues

### 6. Optional Cleanup

```bash
rm /tmp/screenshot_12345.png
```

Only remove if I won't need the file again.

## Handling Missing Tools

If no screenshot tool is available on Linux:

1. **Inform me** which tool is missing
2. **Suggest installation**:

   - Ubuntu/Debian: `sudo apt install gnome-screenshot`
   - Fedora: `sudo dnf install gnome-screenshot`
   - Arch: `sudo pacman -S gnome-screenshot`
   - ImageMagick: `sudo apt install imagemagick` (or equivalent)

3. **Alternative**: Ask user to manually take screenshot and provide path

## Common Mistakes

### ❌ Saying "I cannot take screenshots"

**Reality**: You CAN via Bash + screenshot CLI tools

### ❌ Forgetting to use Read tool after capture

**Reality**: The screenshot file must be loaded with Read tool to see it

### ❌ Using relative paths

**Reality**: Always use absolute paths (`/tmp/...`) for Read tool

### ❌ Not checking for available tools on Linux

**Reality**: Must detect which tool is installed before attempting capture

## Example Workflow

```
User: "Take a screenshot and help me debug this UI bug"

1. Check platform:
   uname -s → Linux

2. Check available tools:
   which gnome-screenshot → /usr/bin/gnome-screenshot

3. Capture screenshot:
   gnome-screenshot -af /tmp/screenshot_1729012345.png
   → User selects area, file saved

4. Load into context:
   Read: file_path="/tmp/screenshot_1729012345.png"
   → Image displays visually

5. Analyze:
   "I can see the button alignment is off. The 'Submit' button
   is 5px lower than the 'Cancel' button..."

6. Optional cleanup:
   rm /tmp/screenshot_1729012345.png
```
