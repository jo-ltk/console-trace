---
name: apple-design
description: Translates Apple's interface design principles (fluid motion, physical models, gesture-driven UI, interruptibility) into actionable web code.
---

# Apple Design Principles for Web

## Core Principles

1. **Direct Manipulation**: UI elements should respond immediately to touch/cursor location.
2. **Interruptibility**: Animations must preserve velocity when interrupted. Use spring physics (`framer-motion` / `motion.dev`) rather than fixed duration keyframes for gesture UI.
3. **Fluidity**: Curves feel physical. Avoid abrupt starts/stops.
4. **Physicality**: Scale down on touch (`transform: scale(0.97)`), spring back on release.
