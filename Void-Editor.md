# Void Editor

## Overview

**Void** is an open-source, AI-powered code editor built as a fork of Visual Studio Code. It serves as a transparent and privacy-focused alternative to commercial AI tools like Cursor and GitHub Copilot, allowing developers to use AI models locally or via APIs without routing data through proprietary servers.

> **Status:** Work on Void is currently paused. The project continues to run but without active maintenance, so some existing features may stop working over time.

---

## Key Features

### AI Capabilities
- **Agent Mode** - Autonomous coding assistance
- **Gather Mode** - Intelligent code gathering and context building
- **Normal Chat** - Conversational AI assistance
- **Smart Autocomplete** - AI-powered code suggestions
- **Inline Editing** - AI-assisted code modifications
- **Code Generation** - Intelligent code creation

### Model Support
Void supports connecting to any AI provider, including:
- **Open Source Models:** DeepSeek, Llama, Gemini, Qwen, and more
- **API Providers:** OpenAI, Claude, Gemini, Ollama, etc.
- **Local Models:** Host open-source models locally for full privacy

### Privacy & Data Control
- Messages sent directly to providers without data retention
- Full control over your code and data
- No proprietary middleman servers
- Transparent, open-source codebase

---

## Architecture

Void is built as a fork of VS Code, inheriting traditional coding features while adding AI capabilities. The project is developed by **Glass Devtools**, a YC-backed startup.

### Repository
- **GitHub:** [voideditor/void](https://github.com/voideditor/void)
- **Website:** [voideditor.com](https://voideditor.com/)

---

## Installation

Void can be downloaded from:
- [SourceForge Mirror](https://sourceforge.net/projects/void.mirror/)
- Official website (when available)

---

## Use Cases

### Who Is It For?
Void is designed for developers seeking AI assistance with coding who want:
- Full control over their data
- The ability to choose any AI model
- Open-source transparency
- Privacy-focused development

### Remote GPU Setup
For running large models (Llama 3, DeepSeek, Qwen) on remote GPU VMs:
1. Run Ollama backend on the remote VM
2. Use SSH port forwarding to connect to your local machine
3. Configure Void Editor to connect to the forwarded Ollama instance

---

## Comparison

| Feature | Void | Cursor | GitHub Copilot |
|---------|------|--------|----------------|
| Open Source | ✅ | ❌ | ❌ |
| Local Models | ✅ | Limited | ❌ |
| Any Provider | ✅ | Limited | OpenAI only |
| Data Privacy | Full control | Partial | Microsoft servers |
| VS Code Fork | ✅ | ❌ | Extension |

---

## Current Status

⚠️ **Important:** The development team has paused work on the Void IDE to explore novel coding ideas. While Void continues to run, it is no longer actively maintained, which means some features may stop working over time.

---

## Resources

- [Official Website](https://voideditor.com/)
- [GitHub Repository](https://github.com/voideditor/void)
- [SourceForge Download](https://sourceforge.net/projects/void.mirror/)
- [DEV Community Guide](https://dev.to/nodeshiftcloud/void-ollama-llms-how-i-turned-my-code-editor-into-a-full-blown-ai-workbench-eop)

---

*Last updated: January 2025*
