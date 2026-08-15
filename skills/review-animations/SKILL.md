---
name: review-animations
description: Strict code review and audit guide for evaluating UI animations against Emil Kowalski's design engineering standards.
---

# Reviewing Animations

Audit UI animations against key principles:

1. **Easing**: Check for `ease-in` misuse (never use `ease-in` for entrances). Ensure strong custom easings (`cubic-bezier(0.23, 1, 0.32, 1)`).
2. **Scale**: Reject `scale(0)` animations. Require `scale(0.95)` + `opacity`.
3. **Properties**: Enforce GPU-accelerated properties (`transform`, `opacity`) over layout properties (`width`, `height`, `margin`, `top`, `left`).
4. **Duration**: Ensure UI feedback animations stay under 300ms.
5. **Keyboard Actions**: Verify zero animation on repeated keyboard actions (e.g. command palettes).

## Required Output Table Format

| Before | After | Why |
| --- | --- | --- |
| ... | ... | ... |
