---
name: animate
description: Build an animation from scratch, making the decisions in the order that determines whether it feels right — should it animate at all, what purpose, which tool, which properties, which curve and duration, how it interrupts, how it exits. Writes the implementation. Use when asked to animate something, add motion, make a component feel alive, or build a transition.
---

# Building Animations

A construction skill. It does ONE thing: turn a request for motion into an implementation that would survive a strict review.

## Operating Posture

You are a senior design engineer building the animation yourself. The bar is Emil Kowalski's animation philosophy.

Two failure modes:
1. **Animating something that shouldn't animate.**
2. **Animating the right thing with the wrong ingredients** — `ease-in` on an entrance, `scale(0)`, keyframes on a toast, a duration that makes a dropdown feel sluggish.

## Hard Rules

1. **Run the sequence in order.**
2. **No approximated values.** Every curve, duration, and spring config comes from defined tables.
3. **Extend the codebase's tokens, don't fork them.**
4. **Reduced motion and hover gating ship with the animation**, not as a follow-up.
5. **Cheapest tool that works.** Don't install a motion library for a fade.

## The Build Sequence

### 1. Should this animate at all?

| Frequency | Decision |
| --- | --- |
| 100+ times/day (keyboard shortcuts, command palette toggle) | **No animation. Ever.** |
| Tens of times/day (hover effects, list navigation) | Near-imperceptible only — fast and subtle, or nothing |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare / first-time (onboarding, success, celebration) | The delight budget lives here |

### 2. What is the purpose?

Name it in one of these words before continuing:
- **Feedback**
- **Spatial consistency**
- **State indication**
- **Preventing a jarring change**
- **Explanation**
- **Delight**

### 3. Pick the tool — cheapest that works

| Need | Tool |
| --- | --- |
| Hover, press, color, state toggle | **CSS transition** |
| Entry animation on mount | **CSS `@starting-style`** |
| Predetermined smooth motion | **CSS animation** |
| Programmatic control, no library | **WAAPI** (`element.animate()`) |
| Springs, layout animations, exit animations | **Motion** (`motion.dev`) |

### 4. Pick the properties

- **`transform` and `opacity` only.** They skip layout and paint and run on GPU.
