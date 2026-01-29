# Settings & Support System Fix

## Overview

The Settings screen has several placeholder functions that need real implementation:
- Legal docs links (Privacy Policy, ToS)
- Support system (Contact, Feedback)
- Export data functionality
- App Store rating link

---

## 1. Legal Docs — Already Clean ✅

Checked both files for em dashes (—) and en dashes (–): **None found.**

Files are ready:
- `PRIVACY_POLICY.md`
- `TERMS_OF_SERVICE.md`

### Display Options

**Option A: In-App WebView (Recommended)**

Create screens that render the markdown:

```typescript
// app/legal/privacy.tsx
import { ScrollView } from 'react-native';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import privacyContent from '@/PRIVACY_POLICY.md'; // or fetch/import

export default function PrivacyPolicyScreen() {
  return (
    <ScreenWrapper>
      <ScrollView style={{ padding: 20 }}>
        {/* Render markdown or pre-formatted text */}
        <ThemedText>{privacyContent}</ThemedText>
      </ScrollView>
    </ScreenWrapper>
  );
}
```

**Option B: Open in Browser**

```typescript
import * as WebBrowser from 'expo-web-browser';

const handlePrivacyPolicy = () => {
  WebBrowser.openBrowserAsync('https://obsy.app/privacy');
};

const handleTermsOfService = () => {
  WebBrowser.openBrowserAsync('https://obsy.app/terms');
};
```

**Option C: Simple Modal with ScrollView**

For MVP, just show the text in a modal.

### Profile.tsx Changes

Update the empty `onPress` handlers:

```typescript
// Current (broken):
<SettingRow
  icon="document-text-outline"
  title="Privacy Policy"
  onPress={() => { }}  // Empty!
  isLast
/>

// Fixed:
<SettingRow
  icon="document-text-outline"
  title="Privacy Policy"
  onPress={() => router.push('/legal/privacy')}
/>

// Add Terms of Service row:
<SettingRow
  icon="document-outline"
  title="Terms of Service"
  onPress={() => router.push('/legal/terms')}
/>
```

---

## 2. Support System

### A. Contact Support (Email)

```typescript
import * as Linking from 'expo-linking';

const handleContactSupport = () => {
  const email = 'support@obsy.app';
  const subject = encodeURIComponent('Obsy Support Request');
  const body = encodeURIComponent(`
App Version: 1.0.0
Device: ${Platform.OS}
User ID: ${user?.id || 'Guest'}

Describe your issue:

  `);
  
  Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
};
```

### B. Feedback System (In-App)

**Option 1: Simple Email Feedback**
Same as contact support but with different subject line.

**Option 2: Feedback Modal**

Create a simple feedback form that sends to your backend:

```typescript
// components/FeedbackModal.tsx
import { Modal, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export function FeedbackModal({ visible, onClose }) {
  const [feedback, setFeedback] = useState('');
  const [type, setType] = useState<'bug' | 'feature' | 'other'>('other');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      Alert.alert('Error', 'Please enter your feedback');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('feedback')
        .insert({
          type,
          message: feedback.trim(),
          app_version: '1.0.0',
          platform: Platform.OS,
        });

      if (error) throw error;

      Alert.alert('Thank You!', 'Your feedback has been submitted.');
      setFeedback('');
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      {/* Modal content */}
    </Modal>
  );
}
```

**Database Table for Feedback:**

```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'other')),
  message TEXT NOT NULL,
  app_version TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved'))
);

-- RLS: Users can insert their own feedback
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert feedback"
  ON feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their feedback"
  ON feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

### C. FAQ / Help

**Option 1: Link to Website**
```typescript
const handleFAQ = () => {
  WebBrowser.openBrowserAsync('https://obsy.app/help');
};
```

**Option 2: In-App FAQ Screen**

Create `app/help/index.tsx` with expandable FAQ items.

---

## 3. Export Data

Current implementation just shows an alert. Here's a real export:

```typescript
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const handleExportData = async () => {
  if (!user) return;

  Alert.alert(
    'Export Data',
    'This will create a JSON file with all your Obsy data.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Export',
        onPress: async () => {
          try {
            // Show loading
            setLoading(true);

            // Fetch all user data from Supabase
            const [captures, insights, settings] = await Promise.all([
              supabase.from('entries').select('*').eq('user_id', user.id),
              supabase.from('daily_insights').select('*').eq('user_id', user.id),
              supabase.from('user_settings').select('*').eq('user_id', user.id),
            ]);

            const exportData = {
              exported_at: new Date().toISOString(),
              user_id: user.id,
              email: user.email,
              captures: captures.data || [],
              insights: insights.data || [],
              settings: settings.data?.[0] || null,
            };

            // Write to file
            const filename = `obsy_export_${Date.now()}.json`;
            const filepath = `${FileSystem.documentDirectory}${filename}`;
            
            await FileSystem.writeAsStringAsync(
              filepath,
              JSON.stringify(exportData, null, 2)
            );

            // Share file
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(filepath, {
                mimeType: 'application/json',
                dialogTitle: 'Export Obsy Data',
              });
            } else {
              Alert.alert('Export Complete', `Saved to: ${filepath}`);
            }
          } catch (error) {
            console.error('Export error:', error);
            Alert.alert('Export Failed', 'Could not export your data. Please try again.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]
  );
};
```

**Required packages:**
```bash
npx expo install expo-sharing
```

---

## 4. Rate App

Link to App Store review page:

```typescript
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const APP_STORE_ID = 'YOUR_APP_STORE_ID'; // Get this after app is live

const handleRateApp = () => {
  const url = Platform.select({
    ios: `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`,
    android: `market://details?id=com.obsy.app`,
    default: 'https://obsy.app',
  });

  Linking.openURL(url!).catch(() => {
    // Fallback to web
    Linking.openURL('https://apps.apple.com/app/idXXXXXXXXX');
  });
};
```

---

## 5. Profile.tsx Full Diff

```diff
// Add imports
+ import * as WebBrowser from 'expo-web-browser';
+ import * as Linking from 'expo-linking';
+ import * as Sharing from 'expo-sharing';
+ import * as FileSystem from 'expo-file-system';

// Update handlers

- const handleExportData = () => {
-   Alert.alert('Export Data', 'Your data export will begin shortly.', [{ text: 'OK' }]);
- };
+ const handleExportData = async () => {
+   // ... full implementation above
+ };

+ const handlePrivacyPolicy = () => {
+   WebBrowser.openBrowserAsync('https://obsy.app/privacy');
+ };

+ const handleTermsOfService = () => {
+   WebBrowser.openBrowserAsync('https://obsy.app/terms');
+ };

+ const handleContactSupport = () => {
+   const email = 'support@obsy.app';
+   const subject = encodeURIComponent('Obsy Support Request');
+   Linking.openURL(`mailto:${email}?subject=${subject}`);
+ };

+ const handleFAQ = () => {
+   WebBrowser.openBrowserAsync('https://obsy.app/help');
+ };

+ const handleRateApp = () => {
+   // Use actual App Store ID after launch
+   Linking.openURL('itms-apps://itunes.apple.com/app/idXXXXXXXXX?action=write-review');
+ };

// Update SettingRow components

{/* DATA & PRIVACY section */}
<SettingRow
  icon="document-text-outline"
  title="Privacy Policy"
- onPress={() => { }}
+ onPress={handlePrivacyPolicy}
/>
+ <SettingRow
+   icon="document-outline"
+   title="Terms of Service"
+   onPress={handleTermsOfService}
+ />

{/* SUPPORT & ABOUT section */}
<SettingRow
  icon="help-circle-outline"
  title="FAQ / Help"
- onPress={() => { }}
+ onPress={handleFAQ}
/>
<SettingRow
  icon="mail-outline"
  title="Contact Support"
- onPress={() => { }}
+ onPress={handleContactSupport}
/>
<SettingRow
  icon="star-outline"
  title="Rate Obsy"
- onPress={() => { }}
+ onPress={handleRateApp}
  isLast
/>
```

---

## 6. Comparison to Other Apps

### Standard Settings Sections

| App | Legal | Support | Export | Rate |
|-----|-------|---------|--------|------|
| **Daylio** | ✅ Privacy, Terms | ✅ Email | ✅ CSV/PDF | ✅ |
| **Bearable** | ✅ Privacy, Terms | ✅ Email + Discord | ✅ JSON/CSV | ✅ |
| **Finch** | ✅ Privacy, Terms | ✅ Email | ❌ | ✅ |
| **BeReal** | ✅ Privacy, Terms | ✅ Email | ❌ | ✅ |

### Obsy After Fix

| Section | Status |
|---------|--------|
| Privacy Policy | ✅ Link to web |
| Terms of Service | ✅ Link to web |
| Contact Support | ✅ Email link |
| FAQ / Help | ✅ Link to web |
| Export Data | ✅ JSON export |
| Rate App | ✅ App Store link |

---

## 7. Pre-Launch Checklist

- [ ] Set up `support@obsy.app` email
- [ ] Set up `privacy@obsy.app` email (or use support@)
- [ ] Host Privacy Policy at `obsy.app/privacy`
- [ ] Host Terms of Service at `obsy.app/terms`
- [ ] Host FAQ/Help at `obsy.app/help`
- [ ] Create feedback table in Supabase (optional)
- [ ] Get App Store ID after approval (for rating link)
- [ ] Install `expo-sharing` package

---

## 8. Testing Checklist

- [ ] Privacy Policy opens (web or in-app)
- [ ] Terms of Service opens
- [ ] Contact Support opens email app with pre-filled info
- [ ] Export Data creates shareable JSON file
- [ ] Rate Obsy opens App Store (will fail until app is live, that's OK)
- [ ] FAQ opens help page
