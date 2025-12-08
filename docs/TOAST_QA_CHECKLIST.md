# Toast System & Copy Functionality - QA Checklist

## Overview
This checklist covers the one-click copy feature and toast notification system implemented in the AINTIVIRUS wallet extension popup.

---

## Pre-Test Setup
- [ ] Build the extension: `npm run build`
- [ ] Load the extension in Chrome (chrome://extensions → Load unpacked → select `dist` folder)
- [ ] Create/unlock a wallet with some test addresses

---

## Toast Display Tests

### Basic Appearance
- [ ] Toast appears in bottom-right corner of popup
- [ ] Toast has proper dark theme styling (matches extension theme)
- [ ] Toast displays correct icon for each variant:
  - [ ] ✓ Success: green checkmark icon
  - [ ] ✗ Error: red alert icon  
  - [ ] ℹ Info: blue accent color (no icon)
- [ ] Toast text is readable and not truncated unexpectedly

### Animation
- [ ] Toast slides in smoothly from right
- [ ] Toast slides out smoothly to right on dismiss
- [ ] Animations respect reduced motion preferences (Settings → Accessibility → Reduce motion)

### Stacking
- [ ] Multiple toasts stack properly (newest at bottom)
- [ ] Maximum 3 toasts visible at once
- [ ] Oldest toast removed when 4th toast added

### Auto-Dismiss
- [ ] Toast auto-dismisses after ~2.5 seconds
- [ ] Timer resets if new toast appears before old one dismisses

### Manual Dismiss
- [ ] X button on toast is clickable
- [ ] Clicking X dismisses toast immediately (with animation)
- [ ] Dismissed toast doesn't reappear

---

## Copy Functionality Tests

### Wallet Dashboard - Address Copy
- [ ] Click on address in balance card
- [ ] Toast shows "Address copied" with success variant
- [ ] Address is actually copied to clipboard (paste to verify)
- [ ] Works for Solana addresses (base58)
- [ ] Works for EVM addresses (hex)

### Receive View - Address Copy
- [ ] Navigate to Receive screen
- [ ] Click on full address text
- [ ] Toast shows "Address copied"
- [ ] Click "Copy Address" button
- [ ] Same toast behavior
- [ ] Both methods copy correct address

### Swap View - Address Copy
- [ ] Navigate to Swap screen
- [ ] Click "Copy Wallet Address" button
- [ ] Toast shows "Wallet address copied"
- [ ] Address copied correctly

### Error Handling
- [ ] If clipboard fails (rare), toast shows error variant
- [ ] Error message is helpful: "Failed to copy. Try selecting manually."
- [ ] User can still manually select and copy (Ctrl+C/Cmd+C)

---

## Accessibility Tests

### Keyboard Navigation
- [ ] Toast dismiss button is focusable with Tab
- [ ] Can dismiss toast with Enter/Space when focused
- [ ] Focus doesn't get trapped in toast

### Screen Reader
- [ ] Toast has `role="status"` attribute
- [ ] Toast has `aria-live="polite"` attribute
- [ ] Dismiss button has `aria-label="Dismiss notification"`
- [ ] Screen reader announces toast content

### Reduced Motion
- [ ] With prefers-reduced-motion: reduce, animations are disabled
- [ ] Toast still appears and disappears (without animation)

---

## Edge Cases

### Rapid Clicking
- [ ] Rapidly clicking copy doesn't break anything
- [ ] Multiple toasts queue properly
- [ ] No duplicate toasts for same action

### Network Switching
- [ ] Copy works after switching from Solana to Ethereum
- [ ] Copy works after switching back to Solana
- [ ] Correct address is copied for active chain

### Wallet Switching
- [ ] Copy works after switching to different wallet
- [ ] New wallet's address is copied (not old one)

### Extension Lifecycle
- [ ] Copy works immediately after opening popup
- [ ] Copy works after locking and unlocking wallet
- [ ] Toast appears on top of all popup content

---

## Performance Tests

- [ ] Toast appears instantly (<100ms) after copy action
- [ ] No noticeable lag when adding multiple toasts
- [ ] Memory doesn't leak after many toast show/hide cycles
- [ ] Extension popup doesn't slow down with toasts

---

## Browser Compatibility

### Chrome
- [ ] All copy operations work in Chrome 120+
- [ ] Toasts display correctly

### Firefox (if applicable)
- [ ] Build with `npm run build:firefox`
- [ ] All copy operations work
- [ ] Toasts display correctly

---

## Regression Tests

- [ ] Unlock wallet still works
- [ ] Lock wallet still works
- [ ] Send transaction flow unaffected
- [ ] Receive view QR code still generates
- [ ] Swap view DEX links still work
- [ ] All existing functionality preserved

---

## Sign-off

| Test Category | Pass | Fail | Notes |
|---------------|------|------|-------|
| Toast Display |      |      |       |
| Copy Functionality |      |      |       |
| Accessibility |      |      |       |
| Edge Cases |      |      |       |
| Performance |      |      |       |
| Browser Compat |      |      |       |
| Regression |      |      |       |

**Tested by:** _______________  
**Date:** _______________  
**Build version:** v0.1.0  
