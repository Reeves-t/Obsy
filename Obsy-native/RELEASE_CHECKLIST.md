# Obsy Release Checklist

## Must Have (Blockers)

- [ ] **Light theme fixes** - Apply changes from LIGHT_THEME_FIXES.md
- [ ] **Disable dev flag** - Set `ALWAYS_SHOW_ONBOARDING = false` in `app/(tabs)/index.tsx`
- [ ] **Stripe integration** - Wire up payment flow in VanguardPaywall
- [ ] **Tier guardrails** - Implement limits per TIER_GUARDRAILS.md
- [ ] **Camera capture polish** - Finalize camera display
- [ ] **Logo finalized** - App icon + splash screen assets

## Should Have

- [ ] **Albums friend system** - Test adding/removing friends
- [ ] **Storage verification** - Confirm local storage works correctly
- [ ] **Legal docs in-app** - Link Privacy Policy + ToS from settings

## Nice to Have (Post-Launch)

- [ ] Android build
- [ ] Analytics setup
- [ ] Referral system

## Docs Created

- [x] LIGHT_THEME_FIXES.md
- [x] PRIVACY_POLICY.md
- [x] TERMS_OF_SERVICE.md
- [x] TIER_GUARDRAILS.md
