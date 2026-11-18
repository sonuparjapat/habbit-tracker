import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { AdSlot } from '@/components/AdSlot';
import { GuestPrompt } from '@/components/guest';
import { Button, Card, Chip, Input, Row, Screen, SectionTitle, ToggleRow, Txt } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notificationsEnabled, setNotificationsEnabled } from '@/lib/notifications';
import { useTrackers } from '@/lib/queries';
import { colors } from '@/theme';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

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

export default function Profile() {
  const { user, updateProfile, logout, deleteAccount } = useAuth();
  const { data: trackers } = useTrackers();
  const [name, setName] = useState(user?.name ?? '');
  const [notif, setNotif] = useState(true);
  const [saving, setSaving] = useState(false);
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    void notificationsEnabled().then(setNotif);
  }, []);

  if (!user)
    return (
      <Screen>
        <Txt variant="title">Profile</Txt>
        <Txt variant="caption" style={{ marginBottom: 20 }}>You’re browsing as a guest.</Txt>
        <GuestPrompt
          icon="account-circle-outline"
          title="Make it yours"
          message="An account keeps your rules, trades, journal and streaks safe, and turns on reminders."
        />
        <AdSlot placement="profile" />
      </Screen>
    );

  const save = async (data: Parameters<typeof updateProfile>[0]) => {
    setSaving(true);
    try {
      await updateProfile(data);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Txt variant="title">Profile</Txt>
      <Txt variant="caption">{user.email}</Txt>

      <SectionTitle>Account</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Input label="Name" value={name} onChangeText={setName} />
        {name.trim() && name !== user.name ? <Button title="Save name" small loading={saving} onPress={() => save({ name: name.trim() })} /> : null}
        <View style={{ gap: 8 }}>
          <Txt variant="label">Currency</Txt>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {CURRENCIES.map((c) => (
              <Chip key={c} label={c} selected={user.currency === c} onPress={() => save({ currency: c })} />
            ))}
          </Row>
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="label">Timezone</Txt>
          <Txt>{user.timezone}</Txt>
          {deviceTz && deviceTz !== user.timezone ? (
            <Button title={`Use device timezone (${deviceTz})`} variant="secondary" small onPress={() => save({ timezone: deviceTz })} />
          ) : (
            <Txt variant="caption">Your day starts and ends at midnight in this timezone.</Txt>
          )}
        </View>
      </Card>

      <SectionTitle>Reminders</SectionTitle>
      <Card>
        <ToggleRow
          label="Notifications"
          hint="Pre-market rules, end-of-day journal, habit reminders and a nudge to stay away after your day closes."
          value={notif}
          onChange={async (v) => {
            setNotif(v);
            const ok = await setNotificationsEnabled(v, trackers ?? [], user.currency);
            if (v && !ok) {
              setNotif(false);
              await setNotificationsEnabled(false, [], user.currency);
              Alert.alert('Notifications are off', 'Allow notifications for this app in your phone settings.');
            }
          }}
        />
      </Card>

      <AdSlot placement="profile" />

      <SectionTitle>Session</SectionTitle>
      <View style={{ gap: 10 }}>
        <Button title="Sign out" variant="secondary" icon="logout" onPress={() => confirm('Sign out?', 'You can sign back in any time.', logout)} />
        <Button
          title="Delete account"
          variant="ghost"
          icon="delete-outline"
          onPress={() =>
            confirm('Delete your account?', 'All trackers, trades and journals will be permanently deleted. This cannot be undone.', () =>
              deleteAccount().catch((e) => Alert.alert('Could not delete', e?.message)),
            )
          }
        />
      </View>
      <Txt variant="caption" center style={{ marginTop: 24, color: colors.textDim }}>
        Anchor · API {API_URL}
      </Txt>
    </Screen>
  );
}
