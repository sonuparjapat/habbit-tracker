import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, Share, View } from 'react-native';
import { AdSlot } from '@/components/AdSlot';
import { GuestPrompt } from '@/components/guest';
import { Button, Card, Chip, Icon, Input, Row, Screen, SectionTitle, Segmented, ToggleRow, Txt } from '@/components/ui';
import { API_URL, get } from '@/lib/api';
import { deviceCurrency, deviceTimeZone, useAuth } from '@/lib/auth';
import { CATEGORIES } from '@/lib/catalog';
import { setRemindersEnabled } from '@/lib/notifications';
import { useAppConfig } from '@/lib/config';
import { usePrefs } from '@/lib/prefs';
import { enablePush, refreshPushToken } from '@/lib/push';
import { useTrackers } from '@/lib/queries';
import { contactSupport } from '@/lib/support';
import type { CategoryKey } from '@/lib/types';
import { colors } from '@/theme';

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'BRL', 'ZAR', 'NGN', 'PKR', 'BDT', 'IDR'];

function alert(title: string, message?: string) {
  if (Platform.OS === 'web') globalThis.alert?.(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes', style: 'destructive', onPress: onYes },
  ]);
}

function LinkRow({ icon, label, onPress, color = colors.text }: { icon: string; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 14 })}>
      <Row gap={14}>
        <Icon name={icon} size={20} color={color === colors.text ? colors.textMuted : color} />
        <Txt style={{ flex: 1, color }}>{label}</Txt>
        <Icon name="chevron-right" size={20} color={colors.textDim} />
      </Row>
    </Pressable>
  );
}

/** Light / dark / follow the phone. Until the member picks, the admin's default is shown as selected. */
function Appearance() {
  const pref = usePrefs((s) => s.theme);
  const adminTheme = usePrefs((s) => s.adminTheme);
  const update = usePrefs((s) => s.update);
  const value = pref === 'default' ? adminTheme : pref;
  return (
    <>
      <SectionTitle>Appearance</SectionTitle>
      <Segmented
        options={[
          { value: 'light', label: '☀️ Light' },
          { value: 'dark', label: '🌙 Dark' },
          { value: 'system', label: '📱 Auto' },
        ]}
        value={value}
        onChange={(v) => void update({ theme: v })}
      />
    </>
  );
}

/** 20 -> "8 PM" */
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

const Divider = () => <View style={{ height: 1, backgroundColor: colors.border }} />;

export default function Profile() {
  const { user, updateProfile, signOut, logoutEverywhere } = useAuth();
  const { data: trackers } = useTrackers();
  const remindersConsent = usePrefs((s) => s.remindersConsent);
  const { settings } = useAppConfig();
  const [name, setName] = useState(user?.name ?? '');
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user)
    return (
      <Screen>
        <Txt variant="title" style={{ marginBottom: 6 }}>Profile</Txt>
        <Txt variant="caption" style={{ marginBottom: 24 }}>You’re browsing as a guest.</Txt>
        <GuestPrompt icon="account-circle-outline" title="Make it yours" message="An account keeps your rules, streaks and history safe, and syncs them across devices." />
        <Appearance />
        <SectionTitle>About</SectionTitle>
        <Card padded={false} style={{ paddingHorizontal: 20 }}>
          <LinkRow icon="shield-account-outline" label="Privacy Policy" onPress={() => router.push('/legal/privacy' as Href)} />
          <Divider />
          <LinkRow icon="file-document-outline" label="Terms of Use" onPress={() => router.push('/legal/terms' as Href)} />
          <Divider />
          <LinkRow icon="lifebuoy" label="Help & support" onPress={() => void contactSupport()} />
          <Divider />
          <LinkRow icon="message-text-outline" label="Send feedback or report a bug" onPress={() => router.push('/feedback' as Href)} />
        </Card>
        <AdSlot placement="profile" />
      </Screen>
    );

  const save = async (data: Parameters<typeof updateProfile>[0]) => {
    try {
      await updateProfile(data);
    } catch (e: any) {
      alert('Could not save', e?.message);
    }
  };

  // Trackers the evening check-in looks at: habits with a reminder, trading with a journal reminder
  const trackersWithReminder = (trackers ?? []).filter((t) =>
    t.type === 'habit' ? !!(t.config as { reminderTime?: string | null }).reminderTime : t.type === 'trading' ? !!(t.config as { journalReminder?: string | null }).journalReminder : false,
  ).length;

  const devCur = deviceCurrency();
  const currencies = Array.from(new Set([user.currency, ...(devCur ? [devCur] : []), ...COMMON_CURRENCIES]));
  const devTz = deviceTimeZone();

  const exportData = async () => {
    setBusy(true);
    try {
      const data = await get('/auth/me/export');
      await Share.share({ title: 'Anchor data export', message: JSON.stringify(data, null, 2) });
    } catch (e: any) {
      alert('Export failed', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleInterest = (k: CategoryKey) =>
    save({ interests: user.interests.includes(k) ? user.interests.filter((x) => x !== k) : [...user.interests, k] });

  return (
    <Screen>
      <Row gap={14} style={{ marginBottom: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="h2">{user.name.slice(0, 1).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="h2">{user.name}</Txt>
          <Row gap={6}>
            <Txt variant="caption" numberOfLines={1}>{user.email}</Txt>
            {user.emailVerified ? <Icon name="check-decagram" size={14} color={colors.green} /> : null}
          </Row>
        </View>
      </Row>

      {!user.emailVerified ? (
        <Card onPress={() => router.push('/verify-email')} accent={colors.amber + '66'} style={{ marginTop: 12 }}>
          <Row gap={12}>
            <Icon name="email-alert-outline" size={22} color={colors.amber} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Verify your email</Txt>
              <Txt variant="caption">So you can recover your account if you forget your password.</Txt>
            </View>
            <Icon name="chevron-right" color={colors.textDim} />
          </Row>
        </Card>
      ) : null}

      {settings.feature_gamification ? (
        <Card padded={false} style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <LinkRow icon="trophy-outline" label="Level & badges" onPress={() => router.push('/achievements' as Href)} />
          <Divider />
          <LinkRow icon="pine-tree" label="Your forest" onPress={() => router.push('/forest' as Href)} />
          <Divider />
          <LinkRow icon="gamepad-variant-outline" label="Arcade · boss, piggy bank, savings" onPress={() => router.push('/games' as Href)} />
        </Card>
      ) : null}
      {settings.tour_enabled ? (
        <Card padded={false} style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <LinkRow
            icon="map-marker-path"
            label="Replay app tour"
            onPress={() => {
              void usePrefs.getState().update({ tourDone: false });
              router.navigate('/');
            }}
          />
        </Card>
      ) : null}

      <SectionTitle>Account</SectionTitle>
      <Card style={{ gap: 18 }}>
        <View style={{ gap: 10 }}>
          <Input label="Name" value={name} onChangeText={setName} />
          {name.trim() && name !== user.name ? <Button title="Save name" small onPress={() => save({ name: name.trim() })} /> : null}
        </View>
        <View style={{ gap: 10 }}>
          <Txt variant="label">Currency</Txt>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {(showAllCurrencies ? currencies : currencies.slice(0, 6)).map((c) => (
              <Chip key={c} label={c} selected={user.currency === c} onPress={() => save({ currency: c })} />
            ))}
            {!showAllCurrencies ? <Chip label="More…" onPress={() => setShowAllCurrencies(true)} /> : null}
          </Row>
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="label">Timezone</Txt>
          <Txt>{user.timezone}</Txt>
          {devTz && devTz !== user.timezone ? (
            <Button title={`Use this device’s timezone (${devTz})`} variant="secondary" small onPress={() => save({ timezone: devTz })} />
          ) : (
            <Txt variant="caption">Your day starts and ends at midnight here.</Txt>
          )}
        </View>
      </Card>

      <SectionTitle>My focus areas</SectionTitle>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <Chip key={c.key} label={c.label} selected={user.interests.includes(c.key)} color={c.color} onPress={() => toggleInterest(c.key)} />
        ))}
      </Row>

      <Appearance />

      {settings.nudge_enabled ? (
        <>
          <SectionTitle>Evening check-in</SectionTitle>
          <Card style={{ gap: 6 }}>
            <Txt variant="caption" style={{ marginBottom: 6 }}>
              Around {hourLabel(settings.nudge_hour)}, if you haven’t logged a tracker that has a reminder, we’ll nudge you once. Already logged? We stay quiet.
            </Txt>
            {trackersWithReminder === 0 ? (
              <Txt variant="caption" color={colors.amber} style={{ marginBottom: 6 }}>
                None of your trackers has a reminder yet — set one in a tracker’s settings to include it.
              </Txt>
            ) : null}
            <ToggleRow
              label="Phone notification"
              value={user.nudgePush && user.hasPushToken}
              onChange={async (v) => {
                if (!v) return save({ nudgePush: false });
                const result = await enablePush().catch(() => 'unavailable' as const);
                if (result === 'ok') await save({ nudgePush: true });
                else if (result === 'denied') alert('Notifications are blocked', 'Allow notifications for Anchor in your phone settings, then try again.');
                else alert('Not available yet', 'Phone nudges aren’t available on this version of the app yet. Switch on the email nudge meanwhile.');
              }}
            />
            <Divider />
            <ToggleRow
              label="Email"
              hint={user.emailVerified ? undefined : 'Verify your email first.'}
              value={user.nudgeEmail}
              onChange={(v) => {
                if (v && !user.emailVerified) return router.push('/verify-email');
                return save({ nudgeEmail: v });
              }}
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>Privacy & notifications</SectionTitle>
      <Card style={{ gap: 6 }}>
        <ToggleRow
          label="Reminders"
          hint="Only at times you set on your trackers."
          value={remindersConsent}
          onChange={async (v) => {
            const on = await setRemindersEnabled(v, trackers ?? [], user.currency);
            if (v && !on) alert('Notifications are blocked', 'Allow notifications for Anchor in your phone settings, then try again.');
            if (on) void refreshPushToken();
          }}
        />
        <Divider />
        <ToggleRow
          label="News & tips notifications"
          hint="New features, challenges and tips — a few a month at most."
          value={user.pushNews}
          onChange={(v) => save({ pushNews: v })}
        />
        <Divider />
        <ToggleRow label="Tips & product emails" hint="Occasional, never spam." value={user.marketingOptIn} onChange={(v) => save({ marketingOptIn: v })} />
      </Card>
      <Card padded={false} style={{ paddingHorizontal: 20, marginTop: 12 }}>
        <LinkRow icon="download-outline" label={busy ? 'Preparing export…' : 'Export my data'} onPress={exportData} />
        <Divider />
        <LinkRow icon="shield-account-outline" label="Privacy Policy" onPress={() => router.push('/legal/privacy' as Href)} />
        <Divider />
        <LinkRow icon="file-document-outline" label="Terms of Use" onPress={() => router.push('/legal/terms' as Href)} />
          <Divider />
          <LinkRow icon="lifebuoy" label="Help & support" onPress={() => void contactSupport()} />
          <Divider />
          <LinkRow icon="message-text-outline" label="Send feedback or report a bug" onPress={() => router.push('/feedback' as Href)} />
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card padded={false} style={{ paddingHorizontal: 20 }}>
        <LinkRow icon="lock-outline" label="Change password" onPress={() => router.push('/account/password')} />
        <Divider />
        <LinkRow
          icon="cellphone-remove"
          label="Sign out of all devices"
          onPress={() => confirm('Sign out everywhere?', 'You’ll need to sign in again on every device, including this one.', () => void logoutEverywhere())}
        />
      </Card>

      <AdSlot placement="profile" />

      <View style={{ gap: 4, marginTop: 32 }}>
        <Button title="Sign out" variant="secondary" icon="logout" onPress={() => confirm('Sign out?', 'You can sign back in any time.', () => void signOut())} />
        <Button title="Delete account" variant="ghost" icon="delete-outline" onPress={() => router.push('/account/delete')} />
      </View>
      <Txt variant="caption" center style={{ marginTop: 24, color: colors.textDim, fontSize: 12 }}>
        Anchor 1.0 · {API_URL.replace(/^https?:\/\//, '')}
      </Txt>
    </Screen>
  );
}
